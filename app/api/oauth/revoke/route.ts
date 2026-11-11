import { createRoute } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { oauthCorsHeaders, oauthOptions, oauthSuccess, readOAuthFormOrJson, revokeOAuthGrantFromToken } from '../../../../utils/mcpOAuth';

const revoke = async (req: Request): Promise<Response> => {
   const form = await readOAuthFormOrJson(req);
   const token = form?.get('token') ?? '';
   if (token) {
      const revoked = await revokeOAuthGrantFromToken(token);
      if (revoked) { logger.info('[OAuth] Revoked an MCP client grant.', { operation: 'token_revocation' }); }
   }
   // RFC 7009 requires the same response for active, unknown, and already-revoked tokens.
   return oauthSuccess({});
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'oauth/revoke', auth: false, cors: oauthCorsHeaders, POST: revoke });
export const OPTIONS = oauthOptions;
