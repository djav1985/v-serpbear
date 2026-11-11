import { hasValidSessionCookie } from '../../../../utils/verifyUser';
import { createRoute, fail, type ApiContext } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import {
   constantTimeEqual, findCredential, getAuthorizationServerMetadata, getClientRedirectUris, getMcpResourceUrl, getOAuthBaseUrl,
   getScopeFromRequest, MCP_SCOPE_FULL, MCP_SCOPE_READ, oauthCorsHeaders,
   hashSecret, oauthError, oauthOptions, pruneExpiredOAuthCredentials, randomSecret, readClient, readOAuthForm, saveCredential, withOAuthStore,
} from '../../../../utils/mcpOAuth';

const PENDING_COOKIE = 'mcp_oauth_pending';

const getCookieValue = (req: Request, name: string): string | null => {
   const pair = (req.headers.get('cookie') ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
   if (!pair) { return null; }
   try { return decodeURIComponent(pair.slice(name.length + 1)); } catch (_error) { return null; }
};

const clearPendingCookie = (secure: boolean): string => `${PENDING_COOKIE}=; Path=/api/oauth; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

const redirectToApproval = (requestId: string, secure: boolean): Response => {
   const page = new URL('/oauth/approve', getOAuthBaseUrl() as string);
   page.searchParams.set('request', requestId);
   return new Response(null, {
      status: 303,
      headers: {
         Location: page.toString(),
         'Cache-Control': 'no-store',
         'Referrer-Policy': 'no-referrer',
         'Set-Cookie': `${PENDING_COOKIE}=${encodeURIComponent(requestId)}; Path=/api/oauth; HttpOnly; SameSite=Lax; Max-Age=300${secure ? '; Secure' : ''}`,
      },
   });
};

const redirectToClient = (redirectUri: string, values: Record<string, string>, secure: boolean): Response => {
   const target = new URL(redirectUri);
   Object.entries(values).forEach(([key, value]) => target.searchParams.set(key, value));
   return new Response(null, {
      status: 303,
      headers: {
         Location: target.toString(),
         'Cache-Control': 'no-store',
         'Referrer-Policy': 'no-referrer',
         'Set-Cookie': clearPendingCookie(secure),
      },
   });
};

const redirectToLogin = (requestId: string, base: string): Response => {
   const login = new URL('/login', base);
   login.searchParams.set('next', `/oauth/approve?request=${requestId}`);
   return new Response(null, { status: 303, headers: { Location: login.toString(), 'Cache-Control': 'no-store' } });
};

const authorize = async (req: Request, ctx: ApiContext): Promise<Response> => {
   logger.info('[OAuth] Authorization request received.', { operation: 'authorization_request' });
   const base = getOAuthBaseUrl();
   const resource = getMcpResourceUrl();
   if (!base || !resource || !getAuthorizationServerMetadata()) { return fail(503, 'SERVICE_UNAVAILABLE', 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.', ctx); }
   const secure = base.startsWith('https://');
   const params = new URL(req.url).searchParams;
   const clientId = params.get('client_id') ?? '';
   const redirectUri = params.get('redirect_uri') ?? '';
   const responseType = params.get('response_type');
   const state = params.get('state');
   const challenge = params.get('code_challenge') ?? '';
   const challengeMethod = params.get('code_challenge_method');
   const requestedResource = params.get('resource');
   const scope = getScopeFromRequest(params.get('scope'));
   const client = clientId ? await readClient(clientId) : null;
   const knownRedirect = !!client && getClientRedirectUris(client).includes(redirectUri);
   if (!client || !knownRedirect) {
      logger.error('[OAuth] Authorization request rejected.', undefined, { operation: 'authorization', reason: !client ? 'unknown_client' : 'unregistered_redirect_uri' });
      return oauthError('invalid_request', 400, 'Unknown client or unregistered redirect URI.');
   }

   const failThroughClient = (error: string, description?: string) => {
      logger.error('[OAuth] Authorization request rejected.', undefined, {
         operation: 'authorization',
         oauthError: error,
         ...(description ? { description: description.slice(0, 300) } : {}),
      });
      return redirectToClient(
         redirectUri,
         { error, ...(description ? { error_description: description } : {}), ...(state ? { state } : {}), iss: base },
         secure,
      );
   };

   if (responseType !== 'code') { return failThroughClient('unsupported_response_type', 'Only response_type=code is supported.'); }
   if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || challengeMethod !== 'S256') {
      return failThroughClient('invalid_request', 'A PKCE code challenge using S256 is required.');
   }
   if (requestedResource && requestedResource !== resource) {
      return failThroughClient('invalid_target', 'The requested resource does not match this MCP server.');
   }
   if (state && state.length > 2048) { return failThroughClient('invalid_request', 'State is too long.'); }

   const requestId = randomSecret();
   await pruneExpiredOAuthCredentials();
   await saveCredential({
      tokenHash: hashSecret(requestId), kind: 'authorization_request', clientId, redirectUri, codeChallenge: challenge,
      state: state ?? null, resource: requestedResource ?? resource, scope, expiresAt: Date.now() + 5 * 60 * 1000,
   });
   logger.info('[OAuth] Authorization request is ready for account approval.', { operation: 'authorization_request' });
   return redirectToApproval(requestId, secure);
};

const submitConsent = async (req: Request, ctx: ApiContext): Promise<Response> => {
   logger.info('[OAuth] Approval form submission received.', { operation: 'authorization_consent' });
   const base = getOAuthBaseUrl();
   if (!base) { return fail(503, 'SERVICE_UNAVAILABLE', 'OAuth is not configured.', ctx); }
   const secure = base.startsWith('https://');
   const form = await readOAuthForm(req);
   if (!form) { return fail(400, 'BAD_REQUEST', 'Invalid OAuth approval request.', ctx); }
   const requestId = form.get('request') ?? '';
   const cookieId = getCookieValue(req, PENDING_COOKIE);
   if (!requestId || !cookieId || !constantTimeEqual(requestId, cookieId)) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'missing_or_mismatched_request_cookie' });
      return fail(400, 'BAD_REQUEST', 'This approval request has expired. Start the connection again.', ctx);
   }
   if (!hasValidSessionCookie(req)) {
      logger.info('[OAuth] Approval form requires an account login.', { operation: 'authorization_consent', reason: 'login_required' });
      return redirectToLogin(requestId, base);
   }

   const pending = await findCredential(requestId, 'authorization_request');
   if (!pending || pending.expiresAt <= Date.now() || pending.revokedAt || !pending.redirectUri) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'missing_or_expired_request' });
      return fail(400, 'BAD_REQUEST', 'This approval request has expired. Start the connection again.', ctx);
   }
   const client = await readClient(pending.clientId);
   if (!client) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'client_registration_missing' });
      return fail(400, 'BAD_REQUEST', 'The OAuth client registration is no longer available.', ctx);
   }
   const issuer = base;
   const deny = form.get('decision') === 'deny';
   if (deny) {
      const denied = await withOAuthStore((store) => {
         const index = store.credentials.findIndex((item) => item.tokenHash === hashSecret(requestId) && item.kind === 'authorization_request' && item.expiresAt > Date.now());
         if (index < 0) { return false; }
         store.credentials.splice(index, 1);
         return true;
      });
      if (!denied) {
         logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'request_already_used' });
         return fail(400, 'BAD_REQUEST', 'This approval request has already been used.', ctx);
      }
      logger.info('[OAuth] User denied an MCP client authorization request.', { operation: 'authorization_denied' });
      return redirectToClient(pending.redirectUri, { error: 'access_denied', ...(pending.state ? { state: pending.state } : {}), iss: issuer }, secure);
   }

   const code = randomSecret();
   const scope = form.get('read_only') === '1' ? MCP_SCOPE_READ : pending.scope ?? MCP_SCOPE_FULL;
   const codeExpiresAt = Date.now() + 5 * 60 * 1000;
   const consumed = await withOAuthStore((store) => {
      const index = store.credentials.findIndex((item) => item.tokenHash === hashSecret(requestId) && item.kind === 'authorization_request' && item.expiresAt > Date.now());
      if (index < 0) { return false; }
      const current = store.credentials[index];
      store.credentials.splice(index, 1);
      store.credentials.push({
         tokenHash: hashSecret(code), kind: 'authorization_code', clientId: current.clientId,
         redirectUri: current.redirectUri, codeChallenge: current.codeChallenge, state: current.state,
         resource: current.resource, scope, expiresAt: codeExpiresAt, createdAt: Date.now(),
      });
      return true;
   });
   if (!consumed) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'request_already_used' });
      return fail(400, 'BAD_REQUEST', 'This approval request has already been used.', ctx);
   }

   logger.info('[OAuth] User approved an MCP client authorization request.', { operation: 'authorization_approved' });
   return redirectToClient(pending.redirectUri, { code, ...(pending.state ? { state: pending.state } : {}), iss: issuer }, secure);
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'oauth/authorize', auth: false, cors: oauthCorsHeaders, GET: authorize, POST: submitConsent });
export const OPTIONS = oauthOptions;
