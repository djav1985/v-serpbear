import { createTempAppDataDir } from '../__helpers__/tempAppDataDir';
import {
   createClient, getAuthorizationServerMetadata, getProtectedResourceMetadata, getScopeFromRequest, hashSecret,
   parseRedirectUris, revokeOAuthGrantFromToken, withOAuthStore,
} from '../../utils/mcpOAuth';

describe('MCP OAuth compatibility', () => {
   let tempData: ReturnType<typeof createTempAppDataDir>;
   const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

   beforeEach(() => {
      tempData = createTempAppDataDir('serpbear-mcp-oauth-');
      process.env.NEXT_PUBLIC_APP_URL = 'https://serpbear.example';
   });

   afterEach(() => {
      tempData.cleanup();
      if (originalAppUrl === undefined) { delete process.env.NEXT_PUBLIC_APP_URL; }
      else { process.env.NEXT_PUBLIC_APP_URL = originalAppUrl; }
   });

   it('advertises the two example scopes and the /api/oauth/revoke endpoint', () => {
      expect(getAuthorizationServerMetadata()).toMatchObject({
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

   it('accepts HTTPS, loopback HTTP, and private-use redirect schemes with the example limits', () => {
      expect(parseRedirectUris(['https://chatgpt.com/callback', 'http://127.0.0.1:5500/callback', 'cursor://oauth/callback']))
         .toEqual(['https://chatgpt.com/callback', 'http://127.0.0.1:5500/callback', 'cursor://oauth/callback']);
      expect(parseRedirectUris(['http://example.com/callback'])).toBeNull();
      expect(parseRedirectUris(['javascript:alert(1)'])).toBeNull();
      expect(parseRedirectUris(['https://chatgpt.com/callback#fragment'])).toBeNull();
      expect(parseRedirectUris(Array.from({ length: 9 }, (_, index) => `https://client${index}.example/callback`))).toBeNull();
      expect(parseRedirectUris([`https://client.example/${'a'.repeat(2048)}`])).toBeNull();
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
