import { createRoute, readJson } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { createClient, MCP_SCOPE_FULL, MCP_SCOPE_READ, oauthCorsHeaders, oauthError, oauthOptions, oauthSuccess, parseRedirectUris, pruneExpiredOAuthCredentials } from '../../../../utils/mcpOAuth';

const registerClient = async (req: Request): Promise<Response> => {
   logger.info('[OAuth] Dynamic client registration request received.', { operation: 'client_registration' });
   let body: unknown;
   try {
      body = await readJson(req, 16 * 1024);
   } catch (_error) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'invalid_or_oversized_json' });
      return oauthError('invalid_client_metadata', 400, 'body must be JSON of at most 16 KB');
   }
   const metadata = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
   const redirectUris = parseRedirectUris(metadata.redirect_uris);
   if (!redirectUris) {
      logger.error('[OAuth] Client registration rejected.', undefined, { operation: 'client_registration', reason: 'invalid_redirect_uris' });
      if (!Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0 || metadata.redirect_uris.length > 8) {
         return oauthError('invalid_redirect_uri', 400, 'redirect_uris must hold 1 to 8 entries');
      }
      const invalid = metadata.redirect_uris.filter((uri) => typeof uri !== 'string' || !parseRedirectUris([uri]));
      return oauthError('invalid_redirect_uri', 400, `not accepted: ${invalid.join(', ')} (https, http on loopback, or a private-use scheme)`);
   }
   try {
      await pruneExpiredOAuthCredentials();
      const client = await createClient(typeof metadata.client_name === 'string' ? metadata.client_name : null, redirectUris);
      if (!client) {
         logger.error('[OAuth] Dynamic client registration limit reached.', undefined, { operation: 'client_registration', maxClients: 500 });
         return oauthError('temporarily_unavailable', 503, 'too many client registrations on this server; try again later');
      }
      logger.info('[OAuth] Registered an MCP OAuth client.', { operation: 'client_registration' });
      return oauthSuccess({
         client_id: client.clientId,
         client_id_issued_at: Math.floor(client.createdAt / 1000),
         ...(client.clientName ? { client_name: client.clientName } : {}),
         redirect_uris: redirectUris,
         grant_types: ['authorization_code', 'refresh_token'],
         response_types: ['code'],
         token_endpoint_auth_method: 'none',
         scope: `${MCP_SCOPE_FULL} ${MCP_SCOPE_READ}`,
      }, 201);
   } catch (error) {
      logger.error('[OAuth] Dynamic client registration failed while saving client state.', error instanceof Error ? error : new Error(String(error)), { operation: 'client_registration' });
      return oauthError('server_error', 500, 'Unable to register the OAuth client.');
   }
};

const methodNotAllowed = () => oauthError('invalid_request', 405, 'POST a client registration document');

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/register', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: methodNotAllowed, POST: registerClient, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptions;
