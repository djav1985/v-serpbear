import { createRoute, fail, json, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { createClient, MCP_SCOPE, oauthCorsHeaders, oauthError, oauthOptions, parseRedirectUris, pruneExpiredOAuthCredentials } from '../../../../utils/mcpOAuth';

const registerClient = async (req: Request, ctx: ApiContext): Promise<Response> => {
   logger.info('[OAuth] Dynamic client registration request received.', { operation: 'client_registration' });
   const body = await readJson(req);
   if (!body || typeof body !== 'object' || Array.isArray(body)) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'invalid_json_object' });
      return oauthError('invalid_client_metadata', 400, 'A JSON client registration object is required.');
   }
   const metadata = body as Record<string, unknown>;
   const redirectUris = parseRedirectUris(metadata.redirect_uris);
   if (!redirectUris) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'invalid_redirect_uris' });
      return oauthError('invalid_redirect_uri', 400, 'Register one or more HTTPS redirect URIs, or a loopback HTTP URI for a local client.');
   }
   if (metadata.grant_types !== undefined && (!Array.isArray(metadata.grant_types) || metadata.grant_types.some((type) => !['authorization_code', 'refresh_token'].includes(String(type))) || !metadata.grant_types.includes('authorization_code'))) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'unsupported_grant_types' });
      return oauthError('invalid_client_metadata', 400, 'Only the authorization_code grant is supported.');
   }
   if (metadata.response_types !== undefined && (!Array.isArray(metadata.response_types) || metadata.response_types.length !== 1 || metadata.response_types[0] !== 'code')) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'unsupported_response_types' });
      return oauthError('invalid_client_metadata', 400, 'Only the code response type is supported.');
   }
   if (metadata.token_endpoint_auth_method !== undefined && metadata.token_endpoint_auth_method !== 'none') {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'unsupported_token_endpoint_auth_method' });
      return oauthError('invalid_client_metadata', 400, 'Public clients must use token_endpoint_auth_method none.');
   }

   try {
      await pruneExpiredOAuthCredentials();
      const client = await createClient(typeof metadata.client_name === 'string' ? metadata.client_name : null, redirectUris);
      logger.info('[OAuth] Registered an MCP OAuth client.', { operation: 'client_registration' });
      return json({
         client_id: client.clientId,
         client_id_issued_at: Math.floor(client.createdAt / 1000),
         ...(client.clientName ? { client_name: client.clientName } : {}),
         redirect_uris: redirectUris,
         grant_types: ['authorization_code', 'refresh_token'],
         response_types: ['code'],
         token_endpoint_auth_method: 'none',
         scope: MCP_SCOPE,
      }, 201, { ...oauthCorsHeaders, 'Cache-Control': 'no-store' });
   } catch (error) {
      logger.error('[OAuth] Dynamic client registration failed while saving client state.', error instanceof Error ? error : new Error(String(error)), { operation: 'client_registration' });
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Unable to register the OAuth client.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'oauth/register', auth: false, POST: registerClient });
export const OPTIONS = oauthOptions;
