import { createRoute } from '../../../utils/apiLogging';
import {
   getAuthorizationServerMetadata, oauthDiscoveryResponse, oauthOptionsWhenEnabled,
} from '../../../utils/mcpOAuth';

const getMetadata = () => oauthDiscoveryResponse(getAuthorizationServerMetadata());

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({
   name: 'well-known/oauth-authorization-server', auth: false, oauthProtocol: true,
   GET: getMetadata,
});
export const OPTIONS = oauthOptionsWhenEnabled;
