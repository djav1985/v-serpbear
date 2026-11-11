import { getProtectedResourceMetadata, oauthError, oauthOptions, oauthSuccess } from '../../../utils/mcpOAuth';
import { logger } from '../../../utils/logger';

export const dynamic = 'force-dynamic';

/** Root fallback for OAuth clients that probe host-level protected-resource metadata first. */
export const GET = () => {
   const metadata = getProtectedResourceMetadata();
   if (!metadata) { logger.error('[OAuth] Root protected resource metadata unavailable; configure NEXT_PUBLIC_APP_URL with the public HTTPS origin.', undefined, { operation: 'protected_resource_discovery' }); }
   else { logger.info('[OAuth] Served root fallback protected resource metadata.', { operation: 'protected_resource_discovery' }); }
   return metadata ? oauthSuccess(metadata) : oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.');
};

export const OPTIONS = oauthOptions;
