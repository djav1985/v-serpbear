import { logger } from './logger';
import { ensureDatabase } from '../database/init';
import { ApiError, fail, getQuery, readTextUpTo, type ApiContext } from './api/http';
import { redactSecrets, redactUrl } from './logRedaction';
import { getClientIp } from './api/clientIp';
import { isLoginLocked } from './loginThrottle';
import { getApiKeyAttemptKeys } from './apiKeyThrottle';
import { isMcpOAuthEnabled, oauthDisabledResponse } from './mcpOAuth';
import verifyUser, { hasValidApiKey, hasValidSessionCookie, isBearerAuthorization } from './verifyUser';

// Debug logging shows the body of small requests only. Larger ones are never read for the log.
const DEBUG_BODY_LOG_MAX_BYTES = 16 * 1024;

export { ApiError, fail, getParam, getQuery, json, readJson } from './api/http';
export type { ApiContext } from './api/http';

export type ApiHandler = (req: Request, ctx: ApiContext) => Promise<Response> | Response;

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

type RouteDefinition = Partial<Record<HttpMethod, ApiHandler>> & {
   /** Short label used in log lines. */
   name: string;
   /** Requires a login cookie or an allowed API key before any method runs. Defaults to true. */
   auth?: boolean;
   /** Additional headers for JSON responses from protocol routes such as OAuth. */
   cors?: HeadersInit;
   /** OAuth routes own their wire format: skip DB bootstrapping and API request-ID/cache wrappers. */
   oauthProtocol?: boolean;
   /** Preserve MCP protocol headers and body without the app-wide request-ID/cache wrapper. */
   omitResponseMetadata?: boolean;
};

/** For a route that is public for some methods: the 401 response when the request is not signed in, otherwise null. */
export const requireAuth = (req: Request, ctx: ApiContext): Response | null => {
   const authorized = verifyUser(req);
   return authorized === 'authorized' ? null : fail(401, 'UNAUTHORIZED', authorized, ctx);
};

const withRequestId = (response: Response, requestId: string): Response => {
   try {
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('Cache-Control', 'no-cache, no-store');
      return response;
   } catch (_error) {
      // Some responses (redirects, fetched responses) have immutable headers
      const copy = new Response(response.body, response);
      copy.headers.set('X-Request-Id', requestId);
      copy.headers.set('Cache-Control', 'no-cache, no-store');
      return copy;
   }
};

const run = async (handler: ApiHandler | undefined, def: RouteDefinition, req: Request): Promise<Response> => {
   const startTime = Date.now();
   const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
   const ctx: ApiContext = { requestId };
   // Log the path and query only, as the Pages Router did
   const path = (() => { try { const u = new URL(req.url); return `${u.pathname}${u.search}`; } catch (_error) { return req.url; } })();
   const label = `${req.method} ${redactUrl(path)}${def.name ? ` [${def.name}]` : ''}`;

   logger.debug(`[API] ${label}`);

   if (def.oauthProtocol && !isMcpOAuthEnabled()) { return oauthDisabledResponse(); }

   if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
      // Read a bounded slice of a copy, so a large body is never buffered in full before authentication
      let body: unknown;
      try {
         const text = await readTextUpTo(req.clone().body, DEBUG_BODY_LOG_MAX_BYTES);
         body = text ? JSON.parse(text) : undefined;
      } catch (_error) { body = undefined; }
      logger.debug(`[API] Request Details${def.name ? ` [${def.name}]` : ''}`, {
         requestId,
         method: req.method,
         url: redactUrl(path),
         query: redactSecrets(getQuery(req), ['code', 'state']),
         ip: getClientIp(req),
         userAgent: req.headers.get('user-agent'),
         contentType: req.headers.get('content-type'),
         body: redactSecrets(body, ['code', 'state', 'code_verifier']),
      });
   }

   // A client address that sent too many wrong API keys refuses further wrong keys before any handler or key check runs.
   // The correct key is still accepted, so a lockout cannot shut out the owner (this matters when no address is known and
   // all clients share one bucket). A request with a valid login cookie is never refused for it.
   const isMcpEndpoint = (() => { try { return new URL(req.url).pathname === '/api/mcp'; } catch (_error) { return false; } })();
   if (!def.oauthProtocol && !isMcpEndpoint && isBearerAuthorization(req.headers.get('authorization') ?? undefined) && isLoginLocked(getApiKeyAttemptKeys(req)) && !hasValidSessionCookie(req) && !hasValidApiKey(req)) {
      logger.warn(`${label} - 429 (API key locked)`);
      return withRequestId(fail(429, 'TOO_MANY_ATTEMPTS', 'Too many failed API key attempts. Try again in 15 minutes.', ctx, undefined, { 'Retry-After': '900' }), requestId);
   }

   let response: Response;
   try {
      // Fallback for when the instrumentation hook did not run (Docker, standalone). After the first call this is a boolean check.
      if (!def.oauthProtocol) { await ensureDatabase(); }

      if (def.auth !== false) {
         const authorized = verifyUser(req);
         if (authorized !== 'authorized') {
            response = fail(401, 'UNAUTHORIZED', authorized, ctx);
            return withRequestId(response, requestId);
         }
      }

      if (!handler) {
         const allowed = HTTP_METHODS.filter((m) => def[m]).join(', ');
         response = def.oauthProtocol
            ? Response.json({ error: 'invalid_request' }, { status: 405, headers: { Allow: allowed, 'Cache-Control': 'no-store' } })
            : fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', ctx, undefined, { Allow: allowed });
      } else {
         response = await handler(req, ctx);
      }
   } catch (error) {
      if (error instanceof ApiError) {
         response = def.oauthProtocol
            ? Response.json({ error: error.status >= 500 ? 'server_error' : 'invalid_request' }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
            : fail(error.status, error.code, error.message, ctx);
      } else {
         logger.error(`${label} - Exception`, error instanceof Error ? error : new Error(String(error)), {
            requestId,
            duration: Date.now() - startTime,
         });
         response = def.oauthProtocol
            ? Response.json({ error: 'server_error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
            : fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
      }
   }

   if (def.cors && response.headers.get('content-type')?.includes('application/json')) {
      const headers = new Headers(response.headers);
      new Headers(def.cors).forEach((value, key) => headers.set(key, value));
      response = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
   }

   const statusCode = response.status;
   const duration = Date.now() - startTime;
   const isOAuthRoute = def.name.startsWith('oauth/');
   if (statusCode >= 500 || (isOAuthRoute && statusCode >= 400)) {
      let oauthError: Record<string, string> = {};
      if (isOAuthRoute) {
         try {
            const payload = await response.clone().json() as {
               error?: string | { code?: string, message?: string },
               error_description?: string,
            };
            if (typeof payload.error === 'string') {
               oauthError.code = payload.error;
               if (typeof payload.error_description === 'string') { oauthError.description = payload.error_description.slice(0, 300); }
            } else if (payload.error && typeof payload.error === 'object') {
               if (typeof payload.error.code === 'string') { oauthError.code = payload.error.code; }
               if (typeof payload.error.message === 'string') { oauthError.description = payload.error.message.slice(0, 300); }
            }
         } catch (_error) {
            // Keep logging the route and status even if a response is not JSON.
         }
      }
      logger.error(`${label} - ${statusCode}`, undefined, { requestId, statusCode, duration, ...oauthError });
   } else if (statusCode >= 400) {
      logger.debug(`[API] ${label} - ${statusCode}`, { requestId, statusCode, duration });
   } else {
      logger.debug(`[API] ${label} - ${statusCode} (${duration}ms)`);
   }
   return def.oauthProtocol || def.omitResponseMetadata ? response : withRequestId(response, requestId);
};

/**
 * Builds the route exports (GET, POST, PUT, PATCH, DELETE) for an App Router `route.ts`:
 *   export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'keyword', GET: getKeyword });
 * It adds request ids and logging, makes sure the database is ready, checks the login or API key (unless auth is false),
 * turns a thrown error into a 500, and answers any method the route does not define with a 405 in the shared error shape.
 */
export function createRoute(def: RouteDefinition) {
   const entry = (method: HttpMethod) => (req: Request) => run(def[method], def, req);
   return {
      GET: entry('GET'),
      POST: entry('POST'),
      PUT: entry('PUT'),
      PATCH: entry('PATCH'),
      DELETE: entry('DELETE'),
   };
}
