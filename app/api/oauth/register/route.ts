import { createRoute, fail, json, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { createClient, oauthError, parseRedirectUris, pruneExpiredOAuthCredentials } from '../../../../utils/mcpOAuth';

const registerClient = async (req: Request, ctx: ApiContext): Promise<Response> => {
   const body = await readJson(req);
   if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return oauthError('invalid_client_metadata', 400, 'A JSON client registration object is required.');
   }
   const metadata = body as Record<string, unknown>;
   const redirectUris = parseRedirectUris(metadata.redirect_uris);
   if (!redirectUris) {
      return oauthError('invalid_redirect_uri', 400, 'Register one or more HTTPS redirect URIs, or a loopback HTTP URI for a local client.');
   }
   if (metadata.grant_types !== undefined && (!Array.isArray(metadata.grant_types) || metadata.grant_types.some((type) => !['authorization_code', 'refresh_token'].includes(String(type))) || !metadata.grant_types.includes('authorization_code'))) {
      return oauthError('invalid_client_metadata', 400, 'Only the authorization_code grant is supported.');
   }
   if (metadata.response_types !== undefined && (!Array.isArray(metadata.response_types) || metadata.response_types.length !== 1 || metadata.response_types[0] !== 'code')) {
      return oauthError('invalid_client_metadata', 400, 'Only the code response type is supported.');
   }
   if (metadata.token_endpoint_auth_method !== undefined && metadata.token_endpoint_auth_method !== 'none') {
      return oauthError('invalid_client_metadata', 400, 'Public clients must use token_endpoint_auth_method none.');
   }

   try {
      await pruneExpiredOAuthCredentials();
      const client = await createClient(typeof metadata.client_name === 'string' ? metadata.client_name : null, redirectUris);
      return json({
         client_id: client.clientId,
         client_id_issued_at: Math.floor(client.createdAt / 1000),
         client_name: client.clientName,
         redirect_uris: redirectUris,
         grant_types: ['authorization_code', 'refresh_token'],
         response_types: ['code'],
         token_endpoint_auth_method: 'none',
      }, 201, { 'Cache-Control': 'no-store' });
   } catch (_error) {
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Unable to register the OAuth client.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'oauth/register', auth: false, POST: registerClient });
