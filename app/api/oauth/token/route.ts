import { createRoute } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import {
   isMcpOAuthEnabled, McpOAuthScope, MCP_SCOPE_FULL, OAuthCredential, OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_REFRESH_TOKEN_PREFIX,
   OAUTH_ACCESS_TTL_SECONDS, OAUTH_REFRESH_TTL_MS, hashSecret, oauthDisabledResponse, oauthError, oauthSuccess,
   oauthCorsHeaders, oauthOptionsWhenEnabled, randomIdentifier, randomSecret, readOAuthFormOrJson, verifyPkce, withOAuthStore,
} from '../../../../utils/mcpOAuth';

const invalidGrant = (description: string) => oauthError('invalid_grant', 400, description);

const handleToken = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Token request received.', { operation: 'token_request' });
   const form = await readOAuthFormOrJson(req);
   if (!form) {
      logger.debug('[OAuth] Token request rejected.', { operation: 'token_request', reason: 'invalid_or_oversized_form' });
      return oauthError('invalid_request', 400, 'body must be at most 16 KB');
   }
   const grantType = form.get('grant_type');
   const clientId = form.get('client_id');

   if (grantType === 'authorization_code') {
      const code = form.get('code') ?? '';
      const redirectUri = form.get('redirect_uri');
      const verifier = form.get('code_verifier') ?? '';
      const accessToken = randomSecret(OAUTH_ACCESS_TOKEN_PREFIX);
      const refreshToken = randomSecret(OAUTH_REFRESH_TOKEN_PREFIX);
      const now = Date.now();
      const result = await withOAuthStore((store): { kind: 'ok', scope: McpOAuthScope } | { kind: 'invalid', description: string } => {
         const codeHash = hashSecret(code);
         const index = store.credentials.findIndex((credential) => credential.tokenHash === codeHash && credential.kind === 'authorization_code');
         if (index < 0) { return { kind: 'invalid', description: 'unknown or expired code' }; }
         const authorizationCode = store.credentials[index];
         store.credentials.splice(index, 1);
         if (authorizationCode.expiresAt <= now) { return { kind: 'invalid', description: 'unknown or expired code' }; }
         if ((authorizationCode.clientId.startsWith('https://') && clientId !== authorizationCode.clientId) ||
            (clientId && clientId !== authorizationCode.clientId)) {
            return { kind: 'invalid', description: 'code was issued to another client' };
         }
         if (redirectUri && redirectUri !== authorizationCode.redirectUri) { return { kind: 'invalid', description: 'redirect_uri does not match the authorization request' }; }
         if (!authorizationCode.codeChallenge || !verifyPkce(verifier, authorizationCode.codeChallenge)) {
            return { kind: 'invalid', description: 'code_verifier does not match code_challenge' };
         }
         const scope = authorizationCode.scope ?? MCP_SCOPE_FULL;
         const grantId = randomIdentifier();
         const common = { clientId: authorizationCode.clientId, grantId, scope, createdAt: now };
         const records: OAuthCredential[] = [
            { ...common, tokenHash: hashSecret(accessToken), kind: 'access_token', expiresAt: now + OAUTH_ACCESS_TTL_SECONDS * 1000 },
            { ...common, tokenHash: hashSecret(refreshToken), kind: 'refresh_token', expiresAt: now + OAUTH_REFRESH_TTL_MS },
         ];
         store.credentials.push(...records);
         const client = store.clients.find((item) => item.clientId === authorizationCode.clientId);
         if (client) { client.hasGrant = true; }
         return { kind: 'ok', scope };
      });
      if (result.kind !== 'ok') {
         logger.debug('[OAuth] Authorization code exchange rejected.', { operation: 'token_exchange', grantType, reason: 'code_invalid_expired_or_binding_mismatch' });
         return invalidGrant(result.description);
      }
      logger.info('[OAuth] Authorization code exchanged for tokens.', { operation: 'token_exchange', grantType: 'authorization_code' });
      return oauthSuccess({ access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS, refresh_token: refreshToken, scope: result.scope });
   }

   if (grantType === 'refresh_token') {
      const refreshToken = form.get('refresh_token') ?? '';
      const accessToken = randomSecret(OAUTH_ACCESS_TOKEN_PREFIX);
      const nextRefreshToken = randomSecret(OAUTH_REFRESH_TOKEN_PREFIX);
      const now = Date.now();
      const result = await withOAuthStore((store): { kind: 'ok', scope: McpOAuthScope } | { kind: 'invalid' | 'replay' } => {
         const refreshHash = hashSecret(refreshToken);
         const stored = store.credentials.find((credential) => credential.tokenHash === refreshHash && credential.kind === 'refresh_token');
         if (!stored?.grantId) { return { kind: 'invalid' }; }
         if (stored.expiresAt <= now ||
            (stored.clientId.startsWith('https://') && clientId !== stored.clientId) ||
            (clientId && stored.clientId !== clientId)) { return { kind: 'invalid' }; }
         if (stored.revokedAt != null) {
            store.credentials.forEach((credential) => {
               if (credential.grantId === stored.grantId && credential.revokedAt == null) { credential.revokedAt = now; }
            });
            return { kind: 'replay' };
         }
         stored.revokedAt = now;
         const scope = stored.scope ?? MCP_SCOPE_FULL;
         // Keep every rotated refresh-token record until expiry so replaying any
         // previous token can still identify and revoke the active grant.
         store.credentials = store.credentials.filter((credential) => credential.grantId !== stored.grantId || credential.kind !== 'access_token');
         const common = { clientId: stored.clientId, grantId: stored.grantId, scope, createdAt: now };
         store.credentials.push(
            { ...common, tokenHash: hashSecret(accessToken), kind: 'access_token', expiresAt: now + OAUTH_ACCESS_TTL_SECONDS * 1000 },
            { ...common, tokenHash: hashSecret(nextRefreshToken), kind: 'refresh_token', expiresAt: now + OAUTH_REFRESH_TTL_MS },
         );
         return { kind: 'ok', scope };
      });
      if (result.kind !== 'ok') {
      logger.debug('[OAuth] Refresh token exchange rejected.', { operation: 'token_exchange', grantType, reason: result.kind === 'replay' ? 'refresh_token_replay' : 'refresh_token_invalid_expired_or_client_mismatch' });
         return invalidGrant('unknown, expired or already-rotated refresh token');
      }
      logger.debug('[OAuth] Refresh token exchanged for new tokens.', { operation: 'token_exchange', grantType: 'refresh_token' });
      return oauthSuccess({ access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS, refresh_token: nextRefreshToken, scope: result.scope });
   }

   logger.debug('[OAuth] Token request rejected.', { operation: 'token_request', reason: 'unsupported_grant_type' });
   return oauthError('unsupported_grant_type', 400, 'authorization_code and refresh_token only');
};

const methodNotAllowed = () => isMcpOAuthEnabled() ? oauthError('invalid_request', 405) : oauthDisabledResponse();

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/token', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: methodNotAllowed, POST: handleToken, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptionsWhenEnabled;
