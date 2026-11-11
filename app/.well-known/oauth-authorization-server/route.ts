import { getAuthorizationServerMetadata, oauthError, oauthOptions, oauthSuccess } from '../../../utils/mcpOAuth';
import { logger } from '../../../utils/logger';

export const dynamic = 'force-dynamic';

export const GET = () => {
   const metadata = getAuthorizationServerMetadata();
   if (!metadata) { logger.error('[OAuth] Authorization server metadata unavailable; configure NEXT_PUBLIC_APP_URL with the public HTTPS origin.', undefined, { operation: 'authorization_server_discovery' }); }
   else { logger.info('[OAuth] Served authorization server metadata.', { operation: 'authorization_server_discovery' }); }
   return metadata ? oauthSuccess(metadata) : oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.');
};

export const OPTIONS = oauthOptions;
