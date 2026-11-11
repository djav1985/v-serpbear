import { createRoute, readJson } from '../../../../utils/apiLogging';
import { logger } from '../../../../utils/logger';
import { createClient, isMcpOAuthEnabled, MCP_SCOPE_FULL, MCP_SCOPE_READ, oauthCorsHeaders, oauthDisabledResponse, oauthError, oauthOptionsWhenEnabled, oauthSuccess, parseRedirectUris, pruneExpiredOAuthCredentials } from '../../../../utils/mcpOAuth';

const registerClient = async (req: Request): Promise<Response> => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   logger.debug('[OAuth] Dynamic client registration request received.', { operation: 'client_registration' });
   let body: unknown;
   try {
      body = await readJson(req, 16 * 1024);
   } catch (_error) {
      logger.debug('[OAuth] Client registration rejected.', { operation: 'client_registration', reason: 'invalid_or_oversized_json' });
      return oauthError('invalid_client_metadata', 400, 'body must be JSON of at most 16 KB');
   }
   const metadata = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
   const redirectUriValues = Array.isArray(metadata.redirect_uris)
      ? metadata.redirect_uris.map((uri) => String(uri))
      : metadata.redirect_uris;
   const redirectUris = parseRedirectUris(redirectUriValues);
   if (!redirectUris) {
      logger.debug('[OAuth] Client registration rejected.', { operation: 'client_registration', reason: 'invalid_redirect_uris' });
      if (!Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0 || metadata.redirect_uris.length > 8) {
         return oauthError('invalid_redirect_uri', 400, 'redirect_uris must hold 1 to 8 entries');
      }
      const invalid = metadata.redirect_uris
         .map((uri) => String(uri))
         .filter((uri) => !parseRedirectUris([uri]));
      return oauthError('invalid_redirect_uri', 400, `not accepted: ${invalid.join(', ')} (https, http on loopback, or a private-use scheme)`);
   }
   try {
      await pruneExpiredOAuthCredentials();
      const client = await createClient(typeof metadata.client_name === 'string' ? metadata.client_name : null, redirectUris);
      if (!client) {
         logger.debug('[OAuth] Dynamic client registration limit reached.', { operation: 'client_registration', maxClients: 500 });
         return oauthError('temporarily_unavailable', 503, 'too many client registrations on this server; try again later');
      }
      logger.debug('[OAuth] Registered an MCP OAuth client.', { operation: 'client_registration' });
      return oauthSuccess({
         client_id: client.clientId,
         client_id_issued_at: Math.floor(client.createdAt / 1000),
         ...(client.clientName !== null ? { client_name: client.clientName } : {}),
         redirect_uris: redirectUris,
         grant_types: ['authorization_code', 'refresh_token'],
         response_types: ['code'],
         token_endpoint_auth_method: 'none',
         scope: `${MCP_SCOPE_FULL} ${MCP_SCOPE_READ}`,
      }, 201);
   } catch (error) {
      logger.debug('[OAuth] Dynamic client registration failed while saving client state.', {
         operation: 'client_registration',
         error: error instanceof Error ? error.message : String(error),
      });
      return oauthError('server_error', 500, 'Unable to register the OAuth client.');
   }
};

const methodNotAllowed = () => isMcpOAuthEnabled() ? oauthError('invalid_request', 405, 'POST a client registration document') : oauthDisabledResponse();

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'oauth/register', auth: false, oauthProtocol: true, cors: oauthCorsHeaders,
   GET: methodNotAllowed, POST: registerClient, PUT: methodNotAllowed, PATCH: methodNotAllowed, DELETE: methodNotAllowed,
});
export const OPTIONS = oauthOptionsWhenEnabled;
