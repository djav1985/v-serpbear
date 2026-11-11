import { getProtectedResourceMetadata, isMcpOAuthEnabled, oauthDisabledResponse, oauthError, oauthOptionsWhenEnabled, oauthSuccess } from '../../../../../utils/mcpOAuth';
import { logger } from '../../../../../utils/logger';

export const dynamic = 'force-dynamic';

export const GET = () => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   const metadata = getProtectedResourceMetadata();
   if (!metadata) { logger.error('[OAuth] Protected resource metadata unavailable; configure NEXT_PUBLIC_APP_URL with the public HTTPS origin.', undefined, { operation: 'protected_resource_discovery' }); }
   else { logger.debug('[OAuth] Served protected resource metadata.', { operation: 'protected_resource_discovery' }); }
   return metadata ? oauthSuccess(metadata) : oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.');
};

export const OPTIONS = oauthOptionsWhenEnabled;
