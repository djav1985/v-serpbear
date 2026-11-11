import { z } from 'zod';
import { clearLoginFailures, recordLoginFailure, isLoginLocked } from '../../../utils/loginThrottle';
import { getApiKeyAttemptKeys } from '../../../utils/apiKeyThrottle';
import { logger } from '../../../utils/logger';
// The SDK exposes these subpaths through a "./*" export pattern that ESLint's resolver cannot read (Node and tsc resolve them)
// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/no-unresolved
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createRoute, fail, type ApiContext } from '../../../utils/apiLogging';
import {
   bearerValue, constantTimeEqual, findCredential, getMcpResourceUrl, getProtectedResourceMetadata, McpOAuthScope,
   MCP_SCOPE_FULL, MCP_SCOPE_READ, OAuthCredential,
} from '../../../utils/mcpOAuth';

type ApiResult = { ok: boolean, status: number, data: unknown };
type ApiCall = (method: 'GET' | 'POST', path: string, query?: Record<string, string>, body?: unknown) => Promise<ApiResult>;

const domainField = z.string().describe('Real domain name, for example example.com');

/** Calls the app's own /api routes over loopback with the same Bearer key, so every existing check still applies. */
const makeApiCall = (baseUrl: string, authorization: string): ApiCall => async (method, path, query, body) => {
   const url = new URL(path, baseUrl);
   Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
   const res = await fetch(url, {
      method,
      headers: {
         Authorization: authorization,
         Accept: 'application/json',
         ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
   });
   const text = await res.text();
   let data: unknown = text;
   try {
      data = text ? JSON.parse(text) : null;
   } catch {
      // Keep the raw text when the response is not JSON
   }
   return { ok: res.ok, status: res.status, data };
};

const buildServer = (call: ApiCall, scope: McpOAuthScope): McpServer => {
   const server = new McpServer({ name: 'serpbear', version: '1.0.0' });
   const reply = (result: ApiResult) => ({
      isError: !result.ok,
      content: [{ type: 'text' as const, text: JSON.stringify(result.data ?? null, null, 2) }],
   });
   const register = <TShape extends z.ZodRawShape>(
      name: string,
      readOnly: boolean,
      description: string,
      inputSchema: TShape,
      handler: (input: z.infer<z.ZodObject<TShape>>) => Promise<ReturnType<typeof reply>>,
   ) => {
      if (scope === MCP_SCOPE_FULL || (scope === MCP_SCOPE_READ && readOnly)) {
         server.registerTool(name, { description, inputSchema }, handler as never);
      }
   };

   register('get_keyword', true, 'Get one tracked keyword by its ID, with its position history.',
      { id: z.string().describe('Keyword ID') }, async ({ id }) => reply(await call('GET', '/api/serp/keyword', { id })));

   register('list_keywords', true, 'List all tracked keywords of a domain.',
      { domain: domainField }, async ({ domain }) => reply(await call('GET', '/api/serp/keywords', { domain })));

   register('list_domains', true, 'List all tracked domains. Set withstats to include keyword statistics.',
      { withstats: z.boolean().optional() }, async ({ withstats }) => reply(await call('GET', '/api/serp/domains', withstats ? { withstats: 'true' } : {})));

   register('get_searchconsole', true, 'Get the raw Google Search Console data for a domain: per-keyword rows for the last 3, 7 and 30 days, plus stats. Fetched again from Google if the stored copy is older than 24 hours.',
      { domain: domainField }, async ({ domain }) => reply(await call('GET', '/api/google/searchconsole', { domain })));

   register('get_insight', true, 'Get a summary of a domain\'s Google Search Console data: the top pages, top keywords and top countries, with stats. Use this for an overview; use get_searchconsole for the full per-keyword rows.',
      { domain: domainField }, async ({ domain }) => reply(await call('GET', '/api/google/insight', { domain })));

   register('get_keyword_ideas', true, 'Get the saved keyword ideas and favourites of a domain. Leave domain out for the research list.',
      { domain: domainField.optional() }, async ({ domain }) => reply(await call('GET', '/api/google/ideas', domain ? { domain } : {})));

   return server;
};

type McpAuthState = { directKeyValid: boolean, oauthCredential: OAuthCredential | null, valid: boolean, reason: string };

const getMcpAuthState = async (req: Request): Promise<McpAuthState> => {
   const mcpApiKey = process.env.MCP_API_KEY;
   const bearer = bearerValue(req);
   const directKeyValid = bearer && mcpApiKey ? constantTimeEqual(bearer, mcpApiKey) : false;
   const oauthCredential = bearer && !directKeyValid ? await findCredential(bearer, 'access_token') : null;
   const resource = getMcpResourceUrl();
   const oauthValid = !!oauthCredential && oauthCredential.revokedAt == null && oauthCredential.expiresAt > Date.now() &&
      (!oauthCredential.resource || oauthCredential.resource === resource);
   const reason = !bearer ? 'missing_bearer_token' : oauthCredential?.expiresAt && oauthCredential.expiresAt <= Date.now()
         ? 'expired_oauth_access_token' : oauthCredential?.resource && oauthCredential.resource !== resource
            ? 'oauth_resource_mismatch' : oauthCredential?.revokedAt != null
               ? 'inactive_oauth_access_token' : 'invalid_or_unrecognized_bearer_token';
   return { directKeyValid: !!directKeyValid, oauthCredential, valid: !!directKeyValid || oauthValid, reason };
};

const unauthorized = (ctx?: ApiContext): Response => {
   const metadata = getProtectedResourceMetadata();
   const headers = metadata ? { 'WWW-Authenticate': `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource', metadata.resource).toString()}"` } : undefined;
   return ctx
      ? fail(401, 'UNAUTHORIZED', 'Provide a valid MCP_API_KEY bearer token or authorize this client with OAuth.', ctx, undefined, headers)
      : Response.json({ error: 'unauthorized' }, { status: 401, headers });
};

const handleMcp = async (req: Request, ctx: ApiContext) => {
   const attempts = getApiKeyAttemptKeys(req);
   const auth = await getMcpAuthState(req);
   if (!auth.valid) {
      const { reason } = auth;
      logger.error('[OAuth] MCP request authentication failed.', undefined, { operation: 'mcp_authentication', reason });
      if (isLoginLocked(attempts)) {
         return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many failed MCP credentials. Try again in 15 minutes.', ctx, undefined, { 'Retry-After': '900' });
      }
      recordLoginFailure(attempts);
      return unauthorized(ctx);
   }
   clearLoginFailures(attempts);
   if (req.method !== 'POST') { return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', ctx, undefined, { Allow: 'POST' }); }
   const internalApiKey = process.env.APIKEY;
   if (!internalApiKey) { return fail(500, 'INTERNAL_SERVER_ERROR', 'APIKEY is required for the MCP server to call internal API routes.', ctx); }
   const scope = auth.directKeyValid ? MCP_SCOPE_FULL : auth.oauthCredential?.scope ?? MCP_SCOPE_FULL;
   logger.info('[OAuth] MCP request authenticated.', { operation: 'mcp_authentication', method: auth.directKeyValid ? 'direct_api_key' : 'oauth_access_token', scope });

   // Tools call this same server on the port the request arrived on
   const call = makeApiCall(`http://127.0.0.1:${process.env.PORT || 3000}`, `Bearer ${internalApiKey}`);
   const server = buildServer(call, scope);
   // Stateless, with plain JSON replies: one request in, one response out, nothing kept between calls
   const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
   await server.connect(transport);
   const response = await transport.handleRequest(req);
   logger.info('[MCP] Streamable HTTP request handled.', { operation: 'mcp_request', statusCode: response.status });
   // Closing now is safe because the reply is already complete (JSON mode)
   void Promise.resolve().then(() => { transport.close(); server.close(); });
   return response;
};

const handleMcpOptions = async (req: Request): Promise<Response> => {
   const auth = await getMcpAuthState(req);
   if (!auth.valid) { return unauthorized(); }
   return new Response(null, { status: 405, headers: { Allow: 'POST' } });
};

// Stateless Streamable HTTP: only POST carries requests; there is no server-initiated stream to open.
// Auth is not the cookie/API-key check of other routes: only the Bearer key counts (checked above).
export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'mcp', auth: false, GET: handleMcp, POST: handleMcp, PUT: handleMcp, PATCH: handleMcp, DELETE: handleMcp });
export const OPTIONS = handleMcpOptions;
