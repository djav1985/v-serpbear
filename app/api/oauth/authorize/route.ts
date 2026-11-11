import { createRoute } from '../../../../utils/apiLogging';
import { getClientIp } from '../../../../utils/api/clientIp';
import { logger } from '../../../../utils/logger';
import {
   constantTimeEqual, findActiveAuthorizationRequest, findCredential, getAuthorizationServerMetadata, getClientRedirectUris, getOAuthBaseUrl, hashSecret,
   getScopeFromRequest, MCP_SCOPE_FULL, MCP_SCOPE_READ, OAUTH_CODE_PREFIX, OAUTH_CODE_TTL_MS, oauthCorsHeaders, oauthError, oauthHtmlError,
   oauthOptions, pruneExpiredOAuthCredentials, randomSecret, readClient, readOAuthForm, saveCredential, withOAuthStore,
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

const escapeHtml = (value: string): string => value
   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderApprovalPage = (requestId: string, clientName: string, callbackHost: string, redirectUri: string, readOnlyRequested: boolean, error: string | null = null, status = 200): Response => {
   const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Authorize MCP connection · SerpBear</title><style>
      :root{color-scheme:light dark;--bg:#f8fafc;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--card:#fff;--accent:#2563eb}
      @media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#f8fafc;--muted:#94a3b8;--line:#334155;--card:#1e293b;--accent:#60a5fa}}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
      main{width:min(100%,440px)}h1{font-size:24px;text-align:center;margin:0 0 20px}.card{padding:24px;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:0 8px 30px #0f172a12}.muted{color:var(--muted);font-size:14px}.details{margin:20px 0;padding:14px;border:1px solid var(--line);border-radius:10px;font-size:14px}.details p{margin:0 0 8px}.details p:last-child{margin:0}.break{overflow-wrap:anywhere}.row{display:flex;align-items:flex-start;gap:10px;margin:20px 0}.buttons{display:grid;gap:10px}.button{width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:8px;background:var(--accent);color:white;font:inherit;font-weight:600;cursor:pointer}.button.secondary{background:transparent;color:var(--fg)}.error{border-left:4px solid #b3261e;padding:10px 14px;background:#b3261e12;border-radius:6px;margin:0 0 18px;font-size:14px}
      label{display:block;font-size:14px;color:var(--muted);margin:14px 0 6px}input[type=password]{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
   </style></head><body><main><h1>SerpBear</h1><section class="card"><h2 style="font-size:17px;margin:0 0 8px">Connect to SerpBear?</h2><p class="muted" style="margin:0">A client asks for access to the MCP server.</p><div class="details"><p><span class="muted">Client: </span><strong>${escapeHtml(clientName)}</strong></p><p class="break"><span class="muted">Returns to: </span>${escapeHtml(callbackHost)}</p><p><span class="muted">Access: </span>${readOnlyRequested ? 'Read-only tools' : 'All available MCP tools'}</p></div>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form action="/api/oauth/authorize" method="post"><input type="hidden" name="request" value="${escapeHtml(requestId)}"><label for="token">Server API key (<code>MCP_API_KEY</code>)</label><input id="token" name="token" type="password" autocomplete="off" autofocus spellcheck="false" required><div class="row"><input type="checkbox" id="read_only" name="read_only" value="1"${readOnlyRequested ? ' checked' : ''}><label for="read_only" style="margin:0;color:inherit">Read-only access (recommended)</label></div><p class="muted">This is the same key used for direct MCP access.</p><div class="buttons"><button class="button" type="submit" name="decision" value="approve">Approve connection</button><button class="button secondary" type="submit" name="decision" value="deny" formnovalidate>Cancel</button></div></form></section></main></body></html>`;
   const cspFormAction = (() => {
      try {
         const url = new URL(redirectUri);
         return url.origin && url.origin !== 'null' ? `'self' ${url.origin}` : `'self' ${url.protocol}`;
      } catch (_error) { return "'self'"; }
   })();
   return new Response(html, {
      status,
      headers: {
         'Content-Type': 'text/html; charset=utf-8',
         'Cache-Control': 'no-store',
         'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action ${cspFormAction}; base-uri 'none'; frame-ancestors 'none'`,
         'X-Content-Type-Options': 'nosniff',
         'Referrer-Policy': 'no-referrer',
      },
   });
};

const authorizationPage = async (requestId: string): Promise<Response> => {
   const pending = await findActiveAuthorizationRequest(requestId);
   if (!pending?.redirectUri) { return oauthHtmlError('This page expired', 'Start the connection again from your client.'); }
   const client = await readClient(pending.clientId);
   if (!client) { return oauthHtmlError('Unknown client', 'The client was removed while this page was open. Add the connector again.'); }
   const callbackHost = (() => { try { const url = new URL(pending.redirectUri); return url.host || url.protocol; } catch { return pending.redirectUri; } })();
   return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.redirectUri, pending.scope === MCP_SCOPE_READ);
};

const authorize = async (req: Request): Promise<Response> => {
   logger.info('[OAuth] Authorization request received.', { operation: 'authorization_request' });
   const base = getOAuthBaseUrl();
   if (!base || !getAuthorizationServerMetadata()) { return oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.'); }
   if (!process.env.MCP_API_KEY) {
      logger.error('[OAuth] Authorization unavailable because MCP_API_KEY is not configured.', undefined, { operation: 'authorization', reason: 'mcp_api_key_not_configured' });
      return oauthHtmlError('OAuth unavailable', 'MCP_API_KEY must be configured before a client can be approved.', 503);
   }
   const params = new URL(req.url).searchParams;
   const existingRequestId = params.get('request');
   if (existingRequestId) { return authorizationPage(existingRequestId); }
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
   logger.info('[OAuth] Authorization request is ready for operator approval.', { operation: 'authorization_request' });
   return authorizationPage(requestId);
};

const submitConsent = async (req: Request): Promise<Response> => {
   logger.info('[OAuth] Approval form submission received.', { operation: 'authorization_consent' });
   const form = await readOAuthForm(req);
   if (!form) { return oauthHtmlError('Request too large', 'The approval form is limited to 16 KB.'); }
   const requestId = form.get('request') ?? '';
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

   if (form.get('decision') !== 'approve') {
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', new URL(pending.redirectUri).host, pending.redirectUri, pending.scope === MCP_SCOPE_READ, 'Choose approve or cancel.');
   }
   const ip = getClientIp(req);
   if (isApprovalIpThrottled(ip)) {
      logger.error('[OAuth] Approval request rate limited.', undefined, { operation: 'authorization_consent', reason: 'too_many_incorrect_api_keys', ip });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.redirectUri, pending.scope === MCP_SCOPE_READ, 'Too many incorrect keys from this address. Wait 15 minutes and try again.', 429);
   }
   const apiKey = process.env.MCP_API_KEY;
   if (!apiKey) {
      logger.error('[OAuth] Approval rejected because MCP_API_KEY is not configured.', undefined, { operation: 'authorization_consent', reason: 'mcp_api_key_not_configured' });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.redirectUri, pending.scope === MCP_SCOPE_READ, 'MCP_API_KEY is not configured on this server.', 503);
   }
   const suppliedKey = (form.get('token') ?? '').trim();
   if (!suppliedKey || !constantTimeEqual(suppliedKey, apiKey)) {
      countApprovalFailure(ip);
      logger.error('[OAuth] Operator API key rejected on the approval page.', undefined, { operation: 'authorization_consent', reason: 'incorrect_mcp_api_key', ip });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.redirectUri, pending.scope === MCP_SCOPE_READ, 'That is not the MCP_API_KEY for this server.', 401);
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

   logger.info('[OAuth] Operator approved an MCP client authorization request.', { operation: 'authorization_approved' });
   return redirectToClient(pending.redirectUri, { code, ...(pending.state ? { state: pending.state } : {}) });
};

const methodNotAllowed = () => oauthError('invalid_request', 405);

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/authorize', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: authorize, POST: submitConsent, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptions;
