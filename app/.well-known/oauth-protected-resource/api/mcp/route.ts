import { createRoute } from '../../../../../utils/apiLogging';
import {
   getProtectedResourceMetadata, oauthDiscoveryResponse, oauthOptionsWhenEnabled,
} from '../../../../../utils/mcpOAuth';

const getMetadata = () => oauthDiscoveryResponse(getProtectedResourceMetadata());

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'well-known/oauth-protected-resource/api/mcp', auth: false, oauthProtocol: true,
   GET: getMetadata,
});
export const OPTIONS = oauthOptionsWhenEnabled;
