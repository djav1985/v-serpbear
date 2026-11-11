import { createRoute } from '../../../../utils/apiLogging';
import { hasValidSessionCookie } from '../../../../utils/verifyUser';
import { getClientIp } from '../../../../utils/api/clientIp';
import { logger } from '../../../../utils/logger';
import {
   constantTimeEqual, findCredential, getAuthorizationServerMetadata, getClientRedirectUris, getOAuthBaseUrl, hashSecret,
   getScopeFromRequest, MCP_SCOPE_FULL, MCP_SCOPE_READ, OAUTH_CODE_PREFIX, OAUTH_CODE_TTL_MS, oauthCorsHeaders, oauthError, oauthHtmlError,
   isMcpOAuthEnabled, oauthDisabledResponse, oauthOptionsWhenEnabled, pruneExpiredOAuthCredentials, randomSecret, readClient, readOAuthForm, saveCredential, withOAuthStore,
} from '../../../../utils/mcpOAuth';

const MAX_APPROVAL_FAILURES = 10;
const APPROVAL_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const approvalFailures = new Map<string, { count: number, expiresAt: number }>();

const isApprovalIpThrottled = (ip: string): boolean => {
   const failures = approvalFailures.get(ip);
   if (!failures || failures.expiresAt <= Date.now()) {
      approvalFailures.delete(ip);
      return false;
   }
   return failures.count >= MAX_APPROVAL_FAILURES;
};

const countApprovalFailure = (ip: string): void => {
   const now = Date.now();
   const failures = approvalFailures.get(ip);
   approvalFailures.set(ip, failures && failures.expiresAt > now
      ? { count: failures.count + 1, expiresAt: now + APPROVAL_FAILURE_WINDOW_MS }
      : { count: 1, expiresAt: now + APPROVAL_FAILURE_WINDOW_MS });
   if (approvalFailures.size > 1000) {
      approvalFailures.forEach((entry, key) => { if (entry.expiresAt <= now) { approvalFailures.delete(key); } });
   }
};

const redirectToClient = (redirectUri: string, values: Record<string, string>): Response => {
   const target = new URL(redirectUri);
   Object.entries(values).forEach(([key, value]) => target.searchParams.set(key, value));
   return new Response(null, {
      status: 303,
      headers: {
         Location: target.toString(),
         'Cache-Control': 'no-store',
      },
   });
};

const redirectToApprovalPage = (baseUrl: string, requestId: string, error?: string): Response => {
   const target = new URL('/api/oauth/approve', baseUrl);
   target.searchParams.set('request', requestId);
   if (error) { target.searchParams.set('error', error); }
   return new Response(null, { status: 303, headers: { Location: target.toString(), 'Cache-Control': 'no-store' } });
};

const isSameOrigin = (origin: string | null, expectedOrigin: string): boolean => {
   if (!origin || origin === 'null') { return false; }
   try { return new URL(origin).origin === expectedOrigin; }
   catch (_error) { return false; }
};

const authorize = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Authorization request received.', { operation: 'authorization_request' });
   const base = getOAuthBaseUrl();
   if (!base || !getAuthorizationServerMetadata()) { return oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.'); }
   const params = new URL(req.url).searchParams;
   const existingRequestId = params.get('request');
   if (existingRequestId) { return redirectToApprovalPage(base, existingRequestId); }
   const clientId = params.get('client_id') ?? '';
   const redirectUri = params.get('redirect_uri') ?? '';
   const responseType = params.get('response_type');
   const state = params.get('state');
   const challenge = params.get('code_challenge') ?? '';
   const challengeMethod = params.get('code_challenge_method');
   const scope = getScopeFromRequest(params.get('scope'));
   const client = clientId ? await readClient(clientId) : null;
   const knownRedirect = !!client && getClientRedirectUris(client).includes(redirectUri);
   if (!client || !knownRedirect) {
      logger.debug('[OAuth] Authorization request rejected.', { operation: 'authorization', reason: !client ? 'unknown_client' : 'unregistered_redirect_uri' });
      return oauthHtmlError(
         !client ? 'Unknown client' : 'Redirect URI mismatch',
         !client ? 'This client_id is not registered on this server. Remove the connector and add it again so it can register.'
            : `The client asked to come back to ${redirectUri || 'nothing'}, which it did not register.`,
      );
   }

   const failThroughClient = (error: string, description?: string) => {
      logger.debug('[OAuth] Authorization request rejected.', {
         operation: 'authorization',
         oauthError: error,
         ...(description ? { description: description.slice(0, 300) } : {}),
      });
      return redirectToClient(
         redirectUri,
         { error, ...(description ? { error_description: description } : {}), ...(state ? { state } : {}) },
      );
   };

   if (responseType !== 'code') { return failThroughClient('unsupported_response_type'); }
   if (!challenge || challengeMethod !== 'S256') {
      return failThroughClient('invalid_request', 'PKCE with code_challenge_method=S256 is required');
   }

   const requestId = randomSecret();
   await pruneExpiredOAuthCredentials();
   await saveCredential({
      tokenHash: hashSecret(requestId), kind: 'authorization_request', clientId, redirectUri, codeChallenge: challenge,
      state: state ?? null, scope, expiresAt: Date.now() + 10 * 60 * 1000,
   });
   logger.debug('[OAuth] Authorization request is ready for operator approval.', { operation: 'authorization_request' });
   return redirectToApprovalPage(base, requestId);
};

const submitConsent = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Approval form submission received.', { operation: 'authorization_consent' });
   const base = getOAuthBaseUrl();
   if (!base) { return oauthHtmlError('OAuth unavailable', 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.', 503); }
   const form = await readOAuthForm(req);
   if (!form) { return oauthHtmlError('Request too large', 'The approval form is limited to 16 KB.'); }
   const requestId = form.get('request') ?? '';
   const pending = await findCredential(requestId, 'authorization_request');
   if (!pending || pending.expiresAt <= Date.now() || pending.revokedAt || !pending.redirectUri) {
      logger.debug('[OAuth] Approval form rejected.', { operation: 'authorization_consent', reason: 'missing_or_expired_request' });
      return oauthHtmlError('This page expired', 'Approval pages are valid for ten minutes. Start the connection again from your client.');
   }
   const client = await readClient(pending.clientId);
   if (!client) {
      logger.debug('[OAuth] Approval form rejected.', { operation: 'authorization_consent', reason: 'client_registration_missing' });
      return oauthHtmlError('Unknown client', 'The client was removed while this page was open. Add the connector again.');
   }
   const deny = form.get('decision') === 'deny';
   if (deny) {
      const denied = await withOAuthStore((store) => {
         const index = store.credentials.findIndex((item) => item.tokenHash === hashSecret(requestId) && item.kind === 'authorization_request' && item.expiresAt > Date.now());
         if (index < 0) { return false; }
         store.credentials.splice(index, 1);
         return true;
      });
      if (!denied) {
         logger.debug('[OAuth] Approval form rejected.', { operation: 'authorization_consent', reason: 'request_already_used' });
         return oauthHtmlError('This page expired', 'Approval pages can only be used once. Start the connection again from your client.');
      }
      logger.debug('[OAuth] User denied an MCP client authorization request.', { operation: 'authorization_denied' });
      return redirectToClient(pending.redirectUri, { error: 'access_denied', ...(pending.state ? { state: pending.state } : {}) });
   }

   if (form.get('decision') !== 'approve') {
      return redirectToApprovalPage(base, requestId, 'invalid_decision');
   }
   const sessionAuthorized = hasValidSessionCookie(req);
   const ip = getClientIp(req);
   if (sessionAuthorized && !isSameOrigin(req.headers.get('origin'), base)) {
      logger.debug('[OAuth] Cookie-based approval rejected.', { operation: 'authorization_consent', reason: 'origin_mismatch' });
      return redirectToApprovalPage(base, requestId, 'invalid_origin');
   }
   const username = form.get('username') ?? '';
   const password = form.get('password') ?? '';
   const configuredUsername = process.env.USER_NAME || process.env.USER;
   const configuredPassword = process.env.PASSWORD;
   const credentialsConfigured = !!configuredUsername && !!configuredPassword;
   const credentialsValid = credentialsConfigured && constantTimeEqual(username, configuredUsername) && constantTimeEqual(password, configuredPassword);
   if (!sessionAuthorized && !credentialsConfigured) {
      logger.debug('[OAuth] Approval rejected because login credentials are not configured.', { operation: 'authorization_consent', reason: 'credentials_unconfigured' });
      return redirectToApprovalPage(base, requestId, 'credentials_unconfigured');
   }
   if (!sessionAuthorized && !credentialsValid) {
      if (isApprovalIpThrottled(ip)) {
         logger.debug('[OAuth] Approval request rate limited.', { operation: 'authorization_consent', reason: 'too_many_incorrect_credentials', ip });
         return redirectToApprovalPage(base, requestId, 'too_many_attempts');
      }
      countApprovalFailure(ip);
      logger.debug('[OAuth] Login credentials rejected on the approval page.', { operation: 'authorization_consent', reason: 'incorrect_credentials', ip });
      return redirectToApprovalPage(base, requestId, 'incorrect_credentials');
   }

   const code = randomSecret(OAUTH_CODE_PREFIX);
   const scope = form.get('read_only') === '1' ? MCP_SCOPE_READ : pending.scope ?? MCP_SCOPE_FULL;
   const codeExpiresAt = Date.now() + OAUTH_CODE_TTL_MS;
   const consumed = await withOAuthStore((store) => {
      const index = store.credentials.findIndex((item) => item.tokenHash === hashSecret(requestId) && item.kind === 'authorization_request' && item.expiresAt > Date.now());
      if (index < 0) { return false; }
      const current = store.credentials[index];
      store.credentials.splice(index, 1);
      store.credentials.push({
         tokenHash: hashSecret(code), kind: 'authorization_code', clientId: current.clientId,
         redirectUri: current.redirectUri, codeChallenge: current.codeChallenge, state: current.state,
         scope, expiresAt: codeExpiresAt, createdAt: Date.now(),
      });
      return true;
   });
   if (!consumed) {
      logger.debug('[OAuth] Approval form rejected.', { operation: 'authorization_consent', reason: 'request_already_used' });
      return oauthHtmlError('This page expired', 'Approval pages can only be used once. Start the connection again from your client.');
   }

   logger.debug('[OAuth] Operator approved an MCP client authorization request.', { operation: 'authorization_approved' });
   return redirectToClient(pending.redirectUri, { code, ...(pending.state ? { state: pending.state } : {}) });
};

const methodNotAllowed = () => isMcpOAuthEnabled() ? oauthError('invalid_request', 405) : oauthDisabledResponse();

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/authorize', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: authorize, POST: submitConsent, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptionsWhenEnabled;
