import { createRoute, type ApiContext } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import {
   McpOAuthScope, MCP_SCOPE_FULL, OAuthCredential, OAUTH_ACCESS_TTL_SECONDS, OAUTH_REFRESH_TTL_MS, hashSecret, oauthError, oauthSuccess,
   oauthCorsHeaders, oauthOptions, randomIdentifier, randomSecret, readOAuthFormOrJson, verifyPkce, withOAuthStore,
} from '../../../../utils/mcpOAuth';

const invalidGrant = () => oauthError('invalid_grant', 400, 'The authorization code or refresh token is invalid, expired, or replayed.');

const handleToken = async (req: Request, _ctx: ApiContext): Promise<Response> => {
   logger.info('[OAuth] Token request received.', { operation: 'token_request' });
   const form = await readOAuthFormOrJson(req);
   if (!form) {
      logger.error('[OAuth] Token request rejected.', undefined, { operation: 'token_request', reason: 'invalid_or_oversized_form' });
      return oauthError('invalid_request', 400, 'Invalid token request.');
   }
   const grantType = form.get('grant_type');
   const clientId = form.get('client_id') ?? '';
   if (!clientId) {
      logger.error('[OAuth] Token request rejected.', undefined, { operation: 'token_request', reason: 'missing_client_id' });
      return oauthError('invalid_request', 400, 'client_id is required.');
   }

   if (grantType === 'authorization_code') {
      const code = form.get('code') ?? '';
      const redirectUri = form.get('redirect_uri') ?? '';
      const verifier = form.get('code_verifier') ?? '';
      if (!code || !redirectUri || verifier.length < 43 || verifier.length > 128) {
         logger.error('[OAuth] Authorization code exchange rejected.', undefined, { operation: 'token_exchange', grantType, reason: 'missing_code_redirect_or_invalid_verifier' });
         return invalidGrant();
      }
      const accessToken = randomSecret();
      const refreshToken = randomSecret();
      const grantId = randomIdentifier();
      const now = Date.now();
      const tokenResource = form.get('resource');
      const result = await withOAuthStore((store): McpOAuthScope | null => {
         const codeHash = hashSecret(code);
         const index = store.credentials.findIndex((credential) => credential.tokenHash === codeHash && credential.kind === 'authorization_code' && credential.clientId === clientId);
         if (index < 0) { return null; }
         const authorizationCode = store.credentials[index];
         if (authorizationCode.expiresAt <= now || authorizationCode.redirectUri !== redirectUri || !authorizationCode.codeChallenge ||
             !verifyPkce(verifier, authorizationCode.codeChallenge) ||
             (tokenResource && authorizationCode.resource && tokenResource !== authorizationCode.resource)) { return null; }
         const scope = authorizationCode.scope ?? MCP_SCOPE_FULL;
         store.credentials.splice(index, 1);
         const common = { clientId, grantId, resource: authorizationCode.resource, scope, createdAt: now };
         const records: OAuthCredential[] = [
            { ...common, tokenHash: hashSecret(accessToken), kind: 'access_token', expiresAt: now + OAUTH_ACCESS_TTL_SECONDS * 1000 },
            { ...common, tokenHash: hashSecret(refreshToken), kind: 'refresh_token', expiresAt: now + OAUTH_REFRESH_TTL_MS },
         ];
         store.credentials.push(...records);
         const client = store.clients.find((item) => item.clientId === clientId);
         if (client) { client.hasGrant = true; }
         return scope;
      });
      if (!result) {
         logger.error('[OAuth] Authorization code exchange rejected.', undefined, { operation: 'token_exchange', grantType, reason: 'code_invalid_expired_or_binding_mismatch' });
         return invalidGrant();
      }
      logger.info('[OAuth] Authorization code exchanged for tokens.', { operation: 'token_exchange', grantType: 'authorization_code' });
      return oauthSuccess({ access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS, refresh_token: refreshToken, scope: result });
   }

   if (grantType === 'refresh_token') {
      const refreshToken = form.get('refresh_token') ?? '';
      if (!refreshToken) {
         logger.error('[OAuth] Refresh token exchange rejected.', undefined, { operation: 'token_exchange', grantType, reason: 'missing_refresh_token' });
         return invalidGrant();
      }
      const accessToken = randomSecret();
      const nextRefreshToken = randomSecret();
      const now = Date.now();
      const tokenResource = form.get('resource');
      const result = await withOAuthStore((store): { kind: 'ok', scope: McpOAuthScope } | { kind: 'invalid' | 'replay' } => {
         const refreshHash = hashSecret(refreshToken);
         const stored = store.credentials.find((credential) => credential.tokenHash === refreshHash && credential.kind === 'refresh_token' && credential.clientId === clientId);
         if (!stored?.grantId) { return { kind: 'invalid' }; }
         if (stored.revokedAt != null) {
            store.credentials.forEach((credential) => {
               if (credential.grantId === stored.grantId && credential.revokedAt == null) { credential.revokedAt = now; }
            });
            return { kind: 'replay' };
         }
         if (stored.expiresAt <= now || (tokenResource && stored.resource && tokenResource !== stored.resource)) { return { kind: 'invalid' }; }
         stored.revokedAt = now;
         const scope = stored.scope ?? MCP_SCOPE_FULL;
         const common = { clientId, grantId: stored.grantId, resource: stored.resource, scope, createdAt: now };
         store.credentials.push(
            { ...common, tokenHash: hashSecret(accessToken), kind: 'access_token', expiresAt: now + OAUTH_ACCESS_TTL_SECONDS * 1000 },
            { ...common, tokenHash: hashSecret(nextRefreshToken), kind: 'refresh_token', expiresAt: now + OAUTH_REFRESH_TTL_MS },
         );
         return { kind: 'ok', scope };
      });
      if (result.kind !== 'ok') {
         logger.error('[OAuth] Refresh token exchange rejected.', undefined, { operation: 'token_exchange', grantType, reason: result.kind === 'replay' ? 'refresh_token_replay' : 'refresh_token_invalid_expired_or_resource_mismatch' });
         return invalidGrant();
      }
      logger.info('[OAuth] Refresh token exchanged for new tokens.', { operation: 'token_exchange', grantType: 'refresh_token' });
      return oauthSuccess({ access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS, refresh_token: nextRefreshToken, scope: result.scope });
   }

   logger.error('[OAuth] Token request rejected.', undefined, { operation: 'token_request', reason: 'unsupported_grant_type' });
   return oauthError('unsupported_grant_type', 400, 'Supported grant types are authorization_code and refresh_token.');
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'oauth/token', auth: false, cors: oauthCorsHeaders, POST: handleToken });
export const OPTIONS = oauthOptions;
