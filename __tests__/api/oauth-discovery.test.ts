import { GET as getAuthorizationServerMetadata } from '../../app/.well-known/oauth-authorization-server/route';
import { GET as getPathAuthorizationServerMetadata } from '../../app/.well-known/oauth-authorization-server/api/mcp/route';
import { GET as getProtectedResourceMetadata } from '../../app/.well-known/oauth-protected-resource/route';
import { GET as getPathProtectedResourceMetadata } from '../../app/.well-known/oauth-protected-resource/api/mcp/route';

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());

describe('OAuth well-known discovery routes', () => {
   const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
   const originalMcpOAuth = process.env.MCP_OAUTH;
   const originalMcpEnabled = process.env.MCP_ENABLED;

   beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://serpbear.example';
      process.env.MCP_OAUTH = 'true';
      process.env.MCP_ENABLED = 'true';
   });

   afterEach(() => {
      if (originalAppUrl === undefined) { delete process.env.NEXT_PUBLIC_APP_URL; }
      else { process.env.NEXT_PUBLIC_APP_URL = originalAppUrl; }
      if (originalMcpOAuth === undefined) { delete process.env.MCP_OAUTH; }
      else { process.env.MCP_OAUTH = originalMcpOAuth; }
      if (originalMcpEnabled === undefined) { delete process.env.MCP_ENABLED; }
      else { process.env.MCP_ENABLED = originalMcpEnabled; }
   });

   it.each([
      ['root authorization-server metadata', getAuthorizationServerMetadata, 'issuer', 'https://serpbear.example'],
      ['MCP-path authorization-server metadata', getPathAuthorizationServerMetadata, 'issuer', 'https://serpbear.example'],
      ['root protected-resource metadata', getProtectedResourceMetadata, 'resource', 'https://serpbear.example/api/mcp'],
      ['MCP-path protected-resource metadata', getPathProtectedResourceMetadata, 'resource', 'https://serpbear.example/api/mcp'],
   ])('serves %s', async (_name, getMetadata, key, value) => {
      const response = await getMetadata(new Request('https://serpbear.example/.well-known/metadata'));

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      await expect(response.json()).resolves.toMatchObject({ [key]: value });
   });

   it('advertises CIMD and keeps DCR available in authorization-server metadata', async () => {
      const response = await getAuthorizationServerMetadata(new Request('https://serpbear.example/.well-known/oauth-authorization-server'));

      await expect(response.json()).resolves.toMatchObject({
         client_id_metadata_document_supported: true,
         registration_endpoint: 'https://serpbear.example/api/oauth/register',
         token_endpoint_auth_methods_supported: ['none'],
      });
   });

   it('disables discovery when MCP OAuth is disabled', async () => {
      process.env.MCP_OAUTH = 'false';
      const response = await getAuthorizationServerMetadata(new Request('https://serpbear.example/.well-known/oauth-authorization-server'));

      expect(response.status).toBe(404);
   });
});
