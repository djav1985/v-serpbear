import { createRoute } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { isMcpOAuthEnabled, oauthCorsHeaders, oauthDisabledResponse, oauthError, oauthOptionsWhenEnabled, oauthSuccess, readOAuthFormOrJson, revokeOAuthGrantFromToken } from '../../../../utils/mcpOAuth';

const revoke = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   const form = await readOAuthFormOrJson(req);
   const token = form?.get('token') ?? '';
   if (token) {
      const revoked = await revokeOAuthGrantFromToken(token);
      if (revoked) { logger.debug('[OAuth] Revoked an MCP client grant.', { operation: 'token_revocation' }); }
   }
   // RFC 7009 requires the same response for active, unknown, and already-revoked tokens.
   return oauthSuccess({});
};

const methodNotAllowed = () => isMcpOAuthEnabled() ? oauthError('invalid_request', 405) : oauthDisabledResponse();

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/revoke', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: methodNotAllowed, POST: revoke, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptionsWhenEnabled;
