import { createTempAppDataDir } from '../__helpers__/tempAppDataDir';
import {
   createClient, getAuthorizationServerMetadata, getProtectedResourceMetadata, getScopeFromRequest, hashSecret,
   parseRedirectUris, revokeOAuthGrantFromToken, withOAuthStore,
} from '../../utils/mcpOAuth';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

const lookupMock = (require('dns/promises') as { lookup: jest.Mock }).lookup;
const getCimdResolver = () => (require('../../utils/mcpOAuth') as {
   resolveOAuthClient?: (clientId: string) => Promise<{ clientId: string, clientName: string | null, redirectUris: string[] } | null>,
}).resolveOAuthClient;
const getDiscoveryResponder = () => (require('../../utils/mcpOAuth') as {
   oauthDiscoveryResponse?: (metadata: unknown | null) => Response,
}).oauthDiscoveryResponse;

describe('MCP OAuth compatibility', () => {
   let tempData: ReturnType<typeof createTempAppDataDir>;
   const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
   const originalMcpOAuth = process.env.MCP_OAUTH;

   beforeEach(() => {
      tempData = createTempAppDataDir('serpbear-mcp-oauth-');
      process.env.NEXT_PUBLIC_APP_URL = 'https://serpbear.example';
      process.env.MCP_OAUTH = 'true';
      lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
   });

   afterEach(() => {
      tempData.cleanup();
      lookupMock.mockReset();
      if (originalAppUrl === undefined) { delete process.env.NEXT_PUBLIC_APP_URL; }
      else { process.env.NEXT_PUBLIC_APP_URL = originalAppUrl; }
      if (originalMcpOAuth === undefined) { delete process.env.MCP_OAUTH; }
      else { process.env.MCP_OAUTH = originalMcpOAuth; }
   });

   it('advertises the two example scopes and the /api/oauth/revoke endpoint', () => {
      expect(getAuthorizationServerMetadata()).toMatchObject({
         client_id_metadata_document_supported: true,
         registration_endpoint: 'https://serpbear.example/api/oauth/register',
         revocation_endpoint: 'https://serpbear.example/api/oauth/revoke',
         revocation_endpoint_auth_methods_supported: ['none'],
         scopes_supported: ['mcp:full', 'mcp:read'],
      });
      expect(getProtectedResourceMetadata()?.scopes_supported).toEqual(['mcp:full', 'mcp:read']);
   });

   it('selects full by default and read scope when requested', () => {
      expect(getScopeFromRequest(null)).toBe('mcp:full');
      expect(getScopeFromRequest('openid offline_access mcp:read')).toBe('mcp:read');
      expect(getScopeFromRequest('mcp:full mcp:read')).toBe('mcp:full');
      expect(getScopeFromRequest('unknown-scope')).toBe('mcp:full');
   });

   it('serves OAuth metadata through a public discovery response with CORS headers', async () => {
      const responder = getDiscoveryResponder();
      expect(responder).toEqual(expect.any(Function));
      const response = responder!(getAuthorizationServerMetadata());

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      await expect(response.json()).resolves.toMatchObject({
         issuer: 'https://serpbear.example',
         client_id_metadata_document_supported: true,
         registration_endpoint: 'https://serpbear.example/api/oauth/register',
      });
   });

   it('disables OAuth discovery when MCP OAuth is disabled', () => {
      process.env.MCP_OAUTH = 'false';
      const responder = getDiscoveryResponder();
      expect(responder).toEqual(expect.any(Function));
      expect(responder!(getAuthorizationServerMetadata()).status).toBe(404);
   });

   it('returns a server error when public OAuth metadata cannot be built', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      const responder = getDiscoveryResponder();
      expect(responder).toEqual(expect.any(Function));
      const response = responder!(getAuthorizationServerMetadata());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: 'server_error' });
   });

   it('accepts HTTPS, loopback HTTP, and private-use redirect schemes with the example limits', () => {
      expect(parseRedirectUris(['https://chatgpt.com/callback', 'http://127.0.0.1:5500/callback', 'cursor://oauth/callback']))
         .toEqual(['https://chatgpt.com/callback', 'http://127.0.0.1:5500/callback', 'cursor://oauth/callback']);
      expect(parseRedirectUris(['http://example.com/callback'])).toBeNull();
      expect(parseRedirectUris(['javascript:alert(1)'])).toBeNull();
      expect(parseRedirectUris(['https://chatgpt.com/callback#fragment'])).toBeNull();
      expect(parseRedirectUris(Array.from({ length: 9 }, (_, index) => `https://client${index}.example/callback`))).toBeNull();
      expect(parseRedirectUris([`https://client.example/${'a'.repeat(2048)}`])).toBeNull();
   });

   it('resolves a CIMD client document and selects none from the supported auth-method intersection', async () => {
      const clientId = 'https://chatgpt.com/oauth/client.json';
      const redirectUri = 'https://chatgpt.com/oauth/callback';
      const previousFetch = global.fetch;
      const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
         client_id: clientId,
         client_name: 'ChatGPT',
         redirect_uris: [redirectUri],
         token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
         token_endpoint_auth_method: 'private_key_jwt',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      global.fetch = fetchMock as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!(clientId)).resolves.toMatchObject({
            clientId,
            clientName: 'ChatGPT',
            redirectUris: [redirectUri],
         });
         expect(fetchMock).toHaveBeenCalledWith(clientId, expect.objectContaining({ redirect: 'error' }));
      } finally {
         global.fetch = previousFetch;
      }
   });

   it.each([
      ['a mismatched client_id', { client_id: 'https://attacker.example/client.json', redirect_uris: ['https://chatgpt.com/callback'], token_endpoint_auth_methods_supported: ['none'] }],
      ['an unsupported token auth method', { client_id: 'https://chatgpt.com/oauth/client.json', redirect_uris: ['https://chatgpt.com/callback'], token_endpoint_auth_methods_supported: ['private_key_jwt'] }],
      ['an invalid redirect URI', { client_id: 'https://chatgpt.com/oauth/client.json', redirect_uris: ['http://attacker.example/callback'], token_endpoint_auth_methods_supported: ['none'] }],
   ])('rejects CIMD metadata with %s', async (_reason, metadata) => {
      const previousFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(metadata), {
         status: 200, headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!('https://chatgpt.com/oauth/client.json')).resolves.toBeNull();
      } finally {
         global.fetch = previousFetch;
      }
   });

   it('rejects a CIMD document hosted at a private address before making a request', async () => {
      const previousFetch = global.fetch;
      const fetchMock = jest.fn();
      lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
      global.fetch = fetchMock as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!('https://chatgpt.com/oauth/client.json')).resolves.toBeNull();
         expect(fetchMock).not.toHaveBeenCalled();
      } finally {
         global.fetch = previousFetch;
      }
   });

   it.each([
      ['an HTTP URL', 'http://chatgpt.com/oauth/client.json'],
      ['a loopback IP', 'https://127.0.0.1/oauth/client.json'],
      ['localhost', 'https://oauth.localhost/client.json'],
      ['URL credentials', 'https://user:password@chatgpt.com/oauth/client.json'],
   ])('rejects CIMD document URLs containing %s without fetching them', async (_reason, clientId) => {
      const previousFetch = global.fetch;
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!(clientId)).resolves.toBeNull();
         expect(fetchMock).not.toHaveBeenCalled();
      } finally {
         global.fetch = previousFetch;
      }
   });

   it.each([
      ['a redirect', 302, 'application/json', JSON.stringify({})],
      ['a non-JSON content type', 200, 'text/plain', JSON.stringify({})],
      ['an oversized document', 200, 'application/json', JSON.stringify({ client_id: 'https://chatgpt.com/oauth/client.json', redirect_uris: ['https://chatgpt.com/callback'], token_endpoint_auth_methods_supported: ['none'], extra: 'x'.repeat(6000) })],
   ])('rejects CIMD metadata with %s', async (_reason, status, contentType, body) => {
      const previousFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue(new Response(body, {
         status, headers: { 'Content-Type': contentType },
      })) as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!('https://chatgpt.com/oauth/client.json')).resolves.toBeNull();
      } finally {
         global.fetch = previousFetch;
      }
   });

   it('keeps registered DCR clients local without fetching metadata documents', async () => {
      const registered = await createClient('Registered client', ['https://client.example/callback']);
      const previousFetch = global.fetch;
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;

      try {
         const resolver = getCimdResolver();
         expect(resolver).toEqual(expect.any(Function));
         await expect(resolver!(registered!.clientId)).resolves.toMatchObject({ clientName: 'Registered client' });
         expect(fetchMock).not.toHaveBeenCalled();
      } finally {
         global.fetch = previousFetch;
      }
   });

   it('caps stored clients and removes stale clients that never received a grant', async () => {
      const stale = Array.from({ length: 500 }, (_, index) => ({
         clientId: `stale-${index}`, clientName: null, redirectUris: ['https://client.example/callback'], createdAt: 1,
      }));
      await withOAuthStore((store) => { store.clients = stale; });

      const client = await createClient('New client', ['https://chatgpt.com/callback']);

      expect(client).not.toBeNull();
      await withOAuthStore((store) => {
         expect(store.clients).toHaveLength(1);
         expect(store.clients[0].clientId).toBe(client?.clientId);
      });
   });

   it('returns no client when the 500-client limit contains only recent registrations', async () => {
      const recent = Array.from({ length: 500 }, (_, index) => ({
         clientId: `recent-${index}`, clientName: null, redirectUris: ['https://client.example/callback'], createdAt: Date.now(),
      }));
      await withOAuthStore((store) => { store.clients = recent; });

      await expect(createClient('Over limit', ['https://chatgpt.com/callback'])).resolves.toBeNull();
   });

   it('revokes every credential in a grant when given one of its tokens', async () => {
      await withOAuthStore((store) => {
         store.credentials = [
            { tokenHash: hashSecret('access-token'), kind: 'access_token', clientId: 'client', grantId: 'grant-1', expiresAt: Date.now() + 1000, createdAt: Date.now() },
            { tokenHash: hashSecret('refresh-token'), kind: 'refresh_token', clientId: 'client', grantId: 'grant-1', expiresAt: Date.now() + 1000, createdAt: Date.now() },
            { tokenHash: 'other-hash', kind: 'access_token', clientId: 'client', grantId: 'grant-2', expiresAt: Date.now() + 1000, createdAt: Date.now() },
         ];
      });

      await expect(revokeOAuthGrantFromToken('access-token')).resolves.toBe(true);
      await withOAuthStore((store) => {
         expect(store.credentials.map((credential) => credential.revokedAt != null)).toEqual([true, true, false]);
      });
      await expect(revokeOAuthGrantFromToken('unknown-token')).resolves.toBe(false);
   });

   it('can revoke a grant through a refresh token from before the last rotation', async () => {
      await withOAuthStore((store) => {
         store.credentials = [
            { tokenHash: hashSecret('previous-refresh'), kind: 'refresh_token', clientId: 'client', grantId: 'rotated-grant', revokedAt: Date.now() - 100, expiresAt: Date.now() + 1000, createdAt: Date.now() - 100 },
            { tokenHash: hashSecret('rotated-access'), kind: 'access_token', clientId: 'client', grantId: 'rotated-grant', expiresAt: Date.now() + 1000, createdAt: Date.now() },
            { tokenHash: hashSecret('current-refresh'), kind: 'refresh_token', clientId: 'client', grantId: 'rotated-grant', expiresAt: Date.now() + 1000, createdAt: Date.now() },
         ];
      });

      await expect(revokeOAuthGrantFromToken('previous-refresh')).resolves.toBe(true);
      await withOAuthStore((store) => {
         expect(store.credentials.every((credential) => credential.revokedAt != null)).toBe(true);
      });
   });
});
