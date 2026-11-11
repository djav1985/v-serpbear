import { createRoute } from '../../../../utils/apiLogging';
import { getClientIp } from '../../../../utils/api/clientIp';
import { getBranding } from '../../../../utils/branding';
import { logger } from '../../../../utils/logger';
import {
   constantTimeEqual, findActiveAuthorizationRequest, findCredential, getAuthorizationServerMetadata, getClientRedirectUris, getOAuthBaseUrl, hashSecret,
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

const escapeHtml = (value: string): string => value
   .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderApprovalPage = (requestId: string, clientName: string, callbackHost: string, readOnlyRequested: boolean, error: string | null = null, status = 200): Response => {
   const branding = getBranding();
   const platformName = escapeHtml(branding.platformName);
   const brandMark = branding.hasCustomLogo
      ? `<img class="logo" src="${escapeHtml(branding.logoApiPath)}" alt="${platformName} logo">`
      : `<svg class="logo default-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1484.32 1348.5" aria-hidden="true"><g transform="translate(-1177.84 -405.75)"><path fill="currentColor" d="M1406.23,604.17s-44-158.18,40.43-192.67,195,97.52,195,97.52,314-65.41,534,0c0,0,122.16-105.61,214.68-80.28,99.9,27.36,32.7,181.38,32.7,181.38s228.36,384.15,239.06,737.38c0,0-346.1,346.09-746.9,406.75,0,0-527.47-106.44-737.38-449.57C1177.88,1304.68,1169.55,1008.54,1406.23,604.17Z"/><path fill="white" d="M1920.79,873S1659,855,1635,1275c0,0-19,182,304.82,178.35,244-2.75,260.55-118.61,266.41-182C2212,1209,2131,874,1920.79,873Z"/><path fill="currentColor" d="M1930.07,1194.67s143.91,5.95,116.55,94-118.93,83.25-118.93,83.25-96.34,0-134.4-95.15C1764.45,1204.62,1930.07,1194.67,1930.07,1194.67Z"/></g></svg>`;
   const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Authorize MCP connection · ${platformName}</title><style>
      :root{--fg:oklch(14.5% 0 0deg);--muted:oklch(55.6% 0 0deg);--line:oklch(92.2% 0 0deg);--card:#fff;--primary:oklch(74.5% 0.19 149.6deg);--primary-fg:oklch(18% 0.04 150deg);--danger:oklch(57.7% 0.245 27.325deg)}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background-color:rgba(245,245,245,.4);background-image:url('/body-texture.png');background-repeat:repeat;color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
      main{width:min(100%,384px)}.brand{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 24px;color:var(--primary);font-size:24px;font-weight:600;line-height:1.2;text-align:center}.logo{width:30px;height:auto;max-height:30px;object-fit:contain}.default-logo{color:var(--primary)}.card{overflow:hidden;border:1px solid rgba(20,20,20,.1);border-radius:12px;background:var(--card);box-shadow:0 1px 2px rgba(0,0,0,.08)}.card-header{padding:16px 16px 0}.card h2{margin:0;font-size:16px;font-weight:500;line-height:1.4}.intro{margin:4px 0 0;color:var(--muted);font-size:14px}.card-content{padding:16px}.muted{color:var(--muted);font-size:14px}.details{margin:0 0 16px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:14px}.details p{margin:0 0 6px}.details p:last-child{margin:0}.break{overflow-wrap:anywhere}.field-label{display:block;margin:0 0 6px;font-size:14px;font-weight:500}.token{display:block;width:100%;height:32px;padding:4px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--fg);font:14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}.token:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(51,204,102,.25)}.row{display:flex;align-items:center;gap:8px;margin:16px 0 8px}.row input{width:16px;height:16px;margin:0;accent-color:#33cc66}.row label{font-size:14px}.hint{margin:0 0 16px;color:var(--muted);font-size:12px}.buttons{display:grid;gap:8px}.button{display:inline-flex;width:100%;height:32px;align-items:center;justify-content:center;padding:0 10px;border:1px solid transparent;border-radius:8px;background:var(--primary);color:var(--primary-fg);font:500 14px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:background-color .15s,box-shadow .15s}.button:hover{background:oklch(68% .19 149.6deg)}.button:focus-visible{outline:3px solid rgba(51,204,102,.35);outline-offset:2px}.button.secondary{border-color:var(--line);background:#fff;color:var(--fg)}.button.secondary:hover{background:oklch(97% 0 0deg)}.error{margin:0 0 16px;padding:10px 12px;border:1px solid color-mix(in oklch,var(--danger),transparent 70%);border-radius:8px;background:color-mix(in oklch,var(--danger),transparent 94%);color:var(--danger);font-size:14px}
   </style></head><body><main><h1 class="brand">${brandMark}<span>${platformName}</span></h1><section class="card"><header class="card-header"><h2>Connect to ${platformName}?</h2><p class="intro">A client asks for access to the MCP server.</p></header><div class="card-content"><div class="details"><p><span class="muted">Client: </span><strong>${escapeHtml(clientName)}</strong></p><p class="break"><span class="muted">Returns to: </span>${escapeHtml(callbackHost)}</p><p><span class="muted">Access: </span>${readOnlyRequested ? 'Read-only tools' : 'All available MCP tools'}</p></div>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form action="/api/oauth/authorize" method="post"><input type="hidden" name="request" value="${escapeHtml(requestId)}"><label class="field-label" for="token">Server API key (<code>MCP_APIKEY</code>)</label><input class="token" id="token" name="token" type="password" autocomplete="off" autofocus spellcheck="false" required><div class="row"><input type="checkbox" id="read_only" name="read_only" value="1"${readOnlyRequested ? ' checked' : ''}><label for="read_only">Read-only access (recommended)</label></div><p class="hint">This is the same key used for direct MCP access.</p><div class="buttons"><button class="button" type="submit" name="decision" value="approve">Approve connection</button><button class="button secondary" type="submit" name="decision" value="deny" formnovalidate>Cancel</button></div></form></div></section></main></body></html>`;
   return new Response(html, {
      status,
      headers: {
         'Content-Type': 'text/html; charset=utf-8',
         'Cache-Control': 'no-store',
      },
   });
};

const authorizationPage = async (requestId: string): Promise<Response> => {
   const pending = await findActiveAuthorizationRequest(requestId);
   if (!pending?.redirectUri) { return oauthHtmlError('This page expired', 'Start the connection again from your client.'); }
   const client = await readClient(pending.clientId);
   if (!client) { return oauthHtmlError('Unknown client', 'The client was removed while this page was open. Add the connector again.'); }
   const callbackHost = (() => { try { const url = new URL(pending.redirectUri); return url.host || url.protocol; } catch { return pending.redirectUri; } })();
   return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.scope === MCP_SCOPE_READ);
};

const authorize = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Authorization request received.', { operation: 'authorization_request' });
   const base = getOAuthBaseUrl();
   if (!base || !getAuthorizationServerMetadata()) { return oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.'); }
   if (!process.env.MCP_APIKEY) {
      logger.debug('[OAuth] Authorization unavailable because MCP_APIKEY is not configured.', { operation: 'authorization', reason: 'mcp_api_key_not_configured' });
      return oauthHtmlError('OAuth unavailable', 'MCP_APIKEY must be configured before a client can be approved.', 503);
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
   return authorizationPage(requestId);
};

const submitConsent = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Approval form submission received.', { operation: 'authorization_consent' });
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
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', new URL(pending.redirectUri).host, pending.scope === MCP_SCOPE_READ, 'Choose approve or cancel.');
   }
   const ip = getClientIp(req);
   if (isApprovalIpThrottled(ip)) {
      logger.debug('[OAuth] Approval request rate limited.', { operation: 'authorization_consent', reason: 'too_many_incorrect_api_keys', ip });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.scope === MCP_SCOPE_READ, 'Too many incorrect keys from this address. Wait 15 minutes and try again.', 429);
   }
   const apiKey = process.env.MCP_APIKEY;
   if (!apiKey) {
      logger.debug('[OAuth] Approval rejected because MCP_APIKEY is not configured.', { operation: 'authorization_consent', reason: 'mcp_api_key_not_configured' });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.scope === MCP_SCOPE_READ, 'MCP_APIKEY is not configured on this server.', 503);
   }
   const suppliedKey = (form.get('token') ?? '').trim();
   if (!suppliedKey || !constantTimeEqual(suppliedKey, apiKey)) {
      countApprovalFailure(ip);
      logger.debug('[OAuth] Operator API key rejected on the approval page.', { operation: 'authorization_consent', reason: 'incorrect_mcp_api_key', ip });
      const callbackHost = (() => { try { const url = new URL(pending.redirectUri!); return url.host || url.protocol; } catch { return pending.redirectUri!; } })();
      return renderApprovalPage(requestId, client.clientName ?? '(unnamed)', callbackHost, pending.scope === MCP_SCOPE_READ, 'That is not the MCP_APIKEY for this server.', 401);
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
