import { hasValidSessionCookie } from '../../../../utils/verifyUser';
import { createRoute } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import {
   constantTimeEqual, findActiveAuthorizationRequest, findCredential, getAuthorizationServerMetadata, getClientRedirectUris, getOAuthBaseUrl,
   getScopeFromRequest, MCP_SCOPE_FULL, MCP_SCOPE_READ, OAUTH_CODE_PREFIX, OAUTH_CODE_TTL_MS, oauthCorsHeaders, oauthError, oauthHtmlError,
   oauthOptions, pruneExpiredOAuthCredentials, randomSecret, readClient, readOAuthForm, saveCredential, withOAuthStore,
} from '../../../../utils/mcpOAuth';

const PENDING_COOKIE = 'mcp_oauth_pending';

const getCookieValue = (req: Request, name: string): string | null => {
   const pair = (req.headers.get('cookie') ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
   if (!pair) { return null; }
   try { return decodeURIComponent(pair.slice(name.length + 1)); } catch (_error) { return null; }
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

const redirectToLogin = (requestId: string, base: string, secure: boolean, setPendingCookie = true): Response => {
   const login = new URL('/login', base);
   login.searchParams.set('next', `/api/oauth/authorize?request=${encodeURIComponent(requestId)}`);
   return new Response(null, {
      status: 303,
      headers: {
         Location: login.toString(),
         'Cache-Control': 'no-store',
         ...(setPendingCookie ? { 'Set-Cookie': `${PENDING_COOKIE}=${encodeURIComponent(requestId)}; Path=/api/oauth; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}` } : {}),
      },
   });
};

const escapeHtml = (value: string): string => value
   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderApprovalPage = (requestId: string, clientName: string, callbackHost: string, redirectUri: string, readOnlyRequested: boolean, secure: boolean): Response => {
   const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Authorize MCP connection · SerpBear</title><style>
      :root{color-scheme:light dark;--bg:#f8fafc;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--card:#fff;--accent:#2563eb}
      @media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8;--line:#334155;--card:#1e293b;--accent:#60a5fa}}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
      main{width:min(100%,440px)}h1{font-size:24px;text-align:center;margin:0 0 20px}.card{padding:24px;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:0 8px 30px #0f172a12}.muted{color:var(--muted);font-size:14px}.details{margin:20px 0;padding:14px;border:1px solid var(--line);border-radius:10px;font-size:14px}.details p{margin:0 0 8px}.details p:last-child{margin:0}.break{overflow-wrap:anywhere}.row{display:flex;align-items:flex-start;gap:10px;margin:20px 0}.buttons{display:grid;gap:10px}.button{width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:8px;background:var(--accent);color:white;font:inherit;font-weight:600;cursor:pointer}.button.secondary{background:transparent;color:var(--fg)}
   </style></head><body><main><h1>SerpBear</h1><section class="card"><h2 style="font-size:17px;margin:0 0 8px">Connect to SerpBear</h2><p class="muted" style="margin:0">Authorize this MCP client to read your SerpBear account.</p><div class="details"><p><span class="muted">Client: </span><strong>${escapeHtml(clientName)}</strong></p><p class="break"><span class="muted">Returns to: </span>${escapeHtml(callbackHost)}</p><p class="muted" style="margin-top:14px">You are signed in to SerpBear. Choose the access level for this connection.</p></div><form action="/api/oauth/authorize" method="post"><input type="hidden" name="request" value="${escapeHtml(requestId)}"><label class="row"><input type="checkbox" name="read_only" value="1"${readOnlyRequested ? ' checked' : ''}><span>Read-only access (recommended)</span></label><p class="muted">Your SerpBear username and password authorize this connection.</p><div class="buttons"><button class="button" type="submit" name="decision" value="approve">Approve connection</button><button class="button secondary" type="submit" name="decision" value="deny" formnovalidate>Cancel</button></div></form></section></main></body></html>`;
   const cspFormAction = (() => {
      try {
         const url = new URL(redirectUri);
         return url.origin && url.origin !== 'null' ? `'self' ${url.origin}` : `'self' ${url.protocol}`;
      } catch (_error) { return "'self'"; }
   })();
   return new Response(html, {
      status: 200,
      headers: {
         'Content-Type': 'text/html; charset=utf-8',
         'Cache-Control': 'no-store',
         'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${cspFormAction}; base-uri 'none'; frame-ancestors 'none'`,
         'X-Content-Type-Options': 'nosniff',
         'Referrer-Policy': 'no-referrer',
         'Set-Cookie': `${PENDING_COOKIE}=${encodeURIComponent(requestId)}; Path=/api/oauth; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`,
      },
   });
};

const authorizationPage = async (req: Request, requestId: string, base: string, secure: boolean): Promise<Response> => {
   const pending = await findActiveAuthorizationRequest(requestId);
   if (!pending?.redirectUri) { return oauthHtmlError('This page expired', 'Start the connection again from your client.'); }
   const client = await readClient(pending.clientId);
   if (!client) { return oauthHtmlError('Unknown client', 'The client was removed while this page was open. Add the connector again.'); }
   const callbackHost = (() => { try { const url = new URL(pending.redirectUri); return url.host || url.protocol; } catch { return pending.redirectUri; } })();
   return hasValidSessionCookie(req)
      ? renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.redirectUri, pending.scope === MCP_SCOPE_READ, secure)
      : redirectToLogin(requestId, base, secure);
};

const authorize = async (req: Request): Promise<Response> => {
   logger.info('[OAuth] Authorization request received.', { operation: 'authorization_request' });
   const base = getOAuthBaseUrl();
   if (!base || !getAuthorizationServerMetadata()) { return oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.'); }
   const secure = base.startsWith('https://');
   const params = new URL(req.url).searchParams;
   const existingRequestId = params.get('request');
   if (existingRequestId) { return authorizationPage(req, existingRequestId, base, secure); }
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
      logger.error('[OAuth] Authorization request rejected.', undefined, { operation: 'authorization', reason: !client ? 'unknown_client' : 'unregistered_redirect_uri' });
      return oauthHtmlError(
         !client ? 'Unknown client' : 'Redirect URI mismatch',
         !client ? 'This client_id is not registered on this server. Remove the connector and add it again so it can register.'
            : `The client asked to come back to ${redirectUri || 'nothing'}, which it did not register.`,
      );
   }

   const failThroughClient = (error: string, description?: string) => {
      logger.error('[OAuth] Authorization request rejected.', undefined, {
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
   logger.info('[OAuth] Authorization request is ready for account approval.', { operation: 'authorization_request' });
   return hasValidSessionCookie(req)
      ? authorizationPage(req, requestId, base, secure)
      : redirectToLogin(requestId, base, secure, true);
};

const submitConsent = async (req: Request): Promise<Response> => {
   logger.info('[OAuth] Approval form submission received.', { operation: 'authorization_consent' });
   const base = getOAuthBaseUrl();
   if (!base) { return oauthError('server_error', 503, 'OAuth is not configured.'); }
   const secure = base.startsWith('https://');
   const form = await readOAuthForm(req);
   if (!form) { return oauthHtmlError('Request too large', 'The approval form is limited to 16 KB.'); }
   const requestId = form.get('request') ?? '';
   const cookieId = getCookieValue(req, PENDING_COOKIE);
   if (!requestId || !cookieId || !constantTimeEqual(requestId, cookieId)) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'missing_or_mismatched_request_cookie' });
      return oauthHtmlError('This page expired', 'Approval pages are valid for ten minutes. Start the connection again from your client.');
   }
   if (!hasValidSessionCookie(req)) {
      logger.info('[OAuth] Approval form requires an account login.', { operation: 'authorization_consent', reason: 'login_required' });
      return redirectToLogin(requestId, base, secure);
   }

   const pending = await findCredential(requestId, 'authorization_request');
   if (!pending || pending.expiresAt <= Date.now() || pending.revokedAt || !pending.redirectUri) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'missing_or_expired_request' });
      return oauthHtmlError('This page expired', 'Approval pages are valid for ten minutes. Start the connection again from your client.');
   }
   const client = await readClient(pending.clientId);
   if (!client) {
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'client_registration_missing' });
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
         logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'request_already_used' });
         return oauthHtmlError('This page expired', 'Approval pages can only be used once. Start the connection again from your client.');
      }
      logger.info('[OAuth] User denied an MCP client authorization request.', { operation: 'authorization_denied' });
      return redirectToClient(pending.redirectUri, { error: 'access_denied', ...(pending.state ? { state: pending.state } : {}) });
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
      logger.error('[OAuth] Approval form rejected.', undefined, { operation: 'authorization_consent', reason: 'request_already_used' });
      return oauthHtmlError('This page expired', 'Approval pages can only be used once. Start the connection again from your client.');
   }

   logger.info('[OAuth] User approved an MCP client authorization request.', { operation: 'authorization_approved' });
   return redirectToClient(pending.redirectUri, { code, ...(pending.state ? { state: pending.state } : {}) });
};

const methodNotAllowed = () => oauthError('invalid_request', 405);

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/authorize', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: authorize, POST: submitConsent, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptions;
