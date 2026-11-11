import { getAuthorizationServerMetadata, oauthError, oauthSuccess } from '../../../utils/mcpOAuth';

export const dynamic = 'force-dynamic';

export const GET = () => {
   const metadata = getAuthorizationServerMetadata();
   return metadata ? oauthSuccess(metadata) : oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.');
};
