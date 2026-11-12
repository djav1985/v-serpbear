import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { createTempAppDataDir } from '../__helpers__/tempAppDataDir';
import { findCredential, hashSecret, withOAuthStore } from '../../utils/mcpOAuth';
import { getSessionVersion } from '../../utils/sessionStore';
import { GET as registerGet, OPTIONS as registerOptions, POST as registerClient } from '../../app/api/oauth/register/route';
import { GET as authorize, POST as consent } from '../../app/api/oauth/authorize/route';
import { POST as token } from '../../app/api/oauth/token/route';
import { POST as revoke } from '../../app/api/oauth/revoke/route';

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('../../utils/logger', () => ({
   __esModule: true,
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalMcpApiKey = process.env.MCP_APIKEY;
const originalMcpOAuth = process.env.MCP_OAUTH;
const originalUserName = process.env.USER_NAME;
const originalUser = process.env.USER;
const originalPassword = process.env.PASSWORD;
const originalSecret = process.env.SECRET;
const lookupMock = (require('dns/promises') as { lookup: jest.Mock }).lookup;

const jsonRequest = (url: string, body: unknown) => new Request(url, {
   method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

const formRequest = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) => new Request(url, {
   method: 'POST',
   headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
   body: new URLSearchParams(body),
});

describe('OAuth routes', () => {
   let tempData: ReturnType<typeof createTempAppDataDir>;
   const appUrl = 'https://serpbear.example';
   const redirectUri = 'https://chatgpt.com/oauth/callback';

   beforeEach(() => {
      tempData = createTempAppDataDir('serpbear-oauth-routes-');
      process.env.NEXT_PUBLIC_APP_URL = appUrl;
      delete process.env.MCP_APIKEY;
      process.env.MCP_OAUTH = 'true';
      process.env.USER_NAME = 'admin';
      process.env.PASSWORD = 'oauth-test-password';
      process.env.SECRET = 'oauth-test-secret';
      lookupMock.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
   });

   afterEach(() => {
      tempData.cleanup();
      lookupMock.mockReset();
      if (originalAppUrl === undefined) { delete process.env.NEXT_PUBLIC_APP_URL; }
      else { process.env.NEXT_PUBLIC_APP_URL = originalAppUrl; }
      if (originalMcpApiKey === undefined) { delete process.env.MCP_APIKEY; }
      else { process.env.MCP_APIKEY = originalMcpApiKey; }
      if (originalMcpOAuth === undefined) { delete process.env.MCP_OAUTH; }
      else { process.env.MCP_OAUTH = originalMcpOAuth; }
      if (originalUserName === undefined) { delete process.env.USER_NAME; }
      else { process.env.USER_NAME = originalUserName; }
      if (originalUser === undefined) { delete process.env.USER; }
      else { process.env.USER = originalUser; }
      if (originalPassword === undefined) { delete process.env.PASSWORD; }
      else { process.env.PASSWORD = originalPassword; }
      if (originalSecret === undefined) { delete process.env.SECRET; }
      else { process.env.SECRET = originalSecret; }
   });

   it('accepts extra DCR metadata and advertises scopes and CORS', async () => {
      const response = await registerClient(jsonRequest(`${appUrl}/api/oauth/register`, {
         client_name: 'ChatGPT',
         redirect_uris: ['cursor://oauth/callback'],
         grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
         response_types: ['code', 'token'],
         token_endpoint_auth_method: 'client_secret_basic',
      }));

      expect(response.status).toBe(201);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-allow-headers')).toBe('content-type, authorization, mcp-protocol-version');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('access-control-max-age')).toBe('86400');
      await expect(response.json()).resolves.toMatchObject({ scope: 'mcp:full mcp:read', token_endpoint_auth_method: 'none' });
   });

   it('runs authorization, read-only approval, token exchange and RFC 7009 revocation', async () => {
      const registration = await registerClient(jsonRequest(`${appUrl}/api/oauth/register`, {
         client_name: 'ChatGPT', redirect_uris: [redirectUri],
      }));
      const client = await registration.json() as { client_id: string };
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const query = new URLSearchParams({
         client_id: client.client_id,
         redirect_uri: redirectUri,
         response_type: 'code',
         state: 'state-1',
         code_challenge: challenge,
         code_challenge_method: 'S256',
         scope: 'openid offline_access mcp:read',
         resource: `${appUrl}/api/mcp`,
      });
      const authorization = await authorize(new Request(`${appUrl}/api/oauth/authorize?${query}`));
      expect(authorization.status).toBe(303);
      const approvalUrl = new URL(authorization.headers.get('location')!);
      expect(approvalUrl.pathname).toBe('/api/oauth/approve');
      const pendingRequest = approvalUrl.searchParams.get('request')!;
      const approved = await consent(formRequest(`${appUrl}/api/oauth/authorize`, {
         request: pendingRequest, username: 'admin', password: 'oauth-test-password', decision: 'approve', read_only: '1',
      }));
      expect(approved.status).toBe(303);
      expect(approved.headers.get('set-cookie')).toBeNull();
      const authorizationCode = new URL(approved.headers.get('location')!).searchParams.get('code')!;

      const exchanged = await token(formRequest(`${appUrl}/api/oauth/token`, {
         grant_type: 'authorization_code', client_id: client.client_id, code: authorizationCode,
         redirect_uri: redirectUri, code_verifier: verifier,
      }));
      expect(exchanged.status).toBe(200);
      const grant = await exchanged.json() as { access_token: string, refresh_token: string, scope: string };
      expect(grant.scope).toBe('mcp:read');

      const revoked = await revoke(jsonRequest(`${appUrl}/api/oauth/revoke`, { token: grant.access_token }));
      expect(revoked.status).toBe(200);
      expect(revoked.headers.get('access-control-allow-origin')).toBe('*');
      await expect(revoked.json()).resolves.toEqual({});
      const stored = await findCredential(grant.access_token, 'access_token');
      expect(stored?.revokedAt).toEqual(expect.any(Number));

      const unknown = await revoke(formRequest(`${appUrl}/api/oauth/revoke`, { token: 'unknown-token' }));
      expect(unknown.status).toBe(200);
      await expect(unknown.json()).resolves.toEqual({});
   });

   it('runs authorization and token exchange for a CIMD client while keeping its URL as the client identity', async () => {
      const clientId = 'https://chatgpt.com/oauth/client.json';
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const previousFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async () => new Response(JSON.stringify({
         client_id: clientId,
         client_name: 'ChatGPT',
         redirect_uris: [redirectUri],
         token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
         token_endpoint_auth_method: 'private_key_jwt',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

      try {
         const query = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            scope: 'mcp:read',
         });
         const authorization = await authorize(new Request(`${appUrl}/api/oauth/authorize?${query}`));
         expect(authorization.status).toBe(303);
         const requestId = new URL(authorization.headers.get('location')!).searchParams.get('request')!;
         const approved = await consent(formRequest(`${appUrl}/api/oauth/authorize`, {
            request: requestId, username: 'admin', password: 'oauth-test-password', decision: 'approve', read_only: '1',
         }));
         const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
         const exchanged = await token(formRequest(`${appUrl}/api/oauth/token`, {
            grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier,
         }));

         expect(exchanged.status).toBe(200);
         await expect(exchanged.json()).resolves.toMatchObject({ token_type: 'Bearer', scope: 'mcp:read' });
      } finally {
         global.fetch = previousFetch;
      }
   });

   it('requires the exact CIMD client ID when exchanging an authorization code', async () => {
      const clientId = 'https://chatgpt.com/oauth/client.json';
      const verifier = randomBytes(32).toString('base64url');
      const code = 'cimd-authorization-code';
      await withOAuthStore((store) => {
         store.credentials.push({
            tokenHash: hashSecret(code), kind: 'authorization_code', clientId, redirectUri,
            codeChallenge: createHash('sha256').update(verifier).digest('base64url'), scope: 'mcp:read',
            expiresAt: Date.now() + 60_000, createdAt: Date.now(),
         });
      });

      const response = await token(formRequest(`${appUrl}/api/oauth/token`, {
         grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier,
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' });
   });

   it('requires the exact CIMD client ID when refreshing a CIMD grant', async () => {
      const clientId = 'https://chatgpt.com/oauth/client.json';
      await withOAuthStore((store) => {
         store.credentials.push({
            tokenHash: hashSecret('cimd-refresh-token'), kind: 'refresh_token', clientId, grantId: 'cimd-grant',
            scope: 'mcp:read', expiresAt: Date.now() + 60_000, createdAt: Date.now(),
         });
      });

      const response = await token(formRequest(`${appUrl}/api/oauth/token`, {
         grant_type: 'refresh_token', refresh_token: 'cimd-refresh-token',
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' });
   });

   it('approves using an existing login cookie without asking for credentials', async () => {
      const registration = await registerClient(jsonRequest(`${appUrl}/api/oauth/register`, {
         client_name: 'ChatGPT', redirect_uris: [redirectUri],
      }));
      const client = await registration.json() as { client_id: string };
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const query = new URLSearchParams({
         client_id: client.client_id,
         redirect_uri: redirectUri,
         response_type: 'code',
         code_challenge: challenge,
         code_challenge_method: 'S256',
      });
      const authorization = await authorize(new Request(`${appUrl}/api/oauth/authorize?${query}`));
      const requestId = new URL(authorization.headers.get('location')!).searchParams.get('request')!;
      const sessionToken = jwt.sign({ user: 'admin', sv: getSessionVersion() }, process.env.SECRET!, { expiresIn: '1h' });

      const approved = await consent(formRequest(`${appUrl}/api/oauth/authorize`, {
         request: requestId, decision: 'approve', read_only: '1',
      }, { Cookie: `token=${sessionToken}`, Origin: appUrl }));

      expect(approved.status).toBe(303);
      expect(new URL(approved.headers.get('location')!).searchParams.get('code')).toBeTruthy();
      expect(approved.headers.get('set-cookie')).toBeNull();
   });

   it('returns to the approval page when the entered username or password is incorrect', async () => {
      const registration = await registerClient(jsonRequest(`${appUrl}/api/oauth/register`, {
         client_name: 'ChatGPT', redirect_uris: [redirectUri],
      }));
      const client = await registration.json() as { client_id: string };
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const query = new URLSearchParams({
         client_id: client.client_id,
         redirect_uri: redirectUri,
         response_type: 'code',
         code_challenge: challenge,
         code_challenge_method: 'S256',
      });
      const authorization = await authorize(new Request(`${appUrl}/api/oauth/authorize?${query}`));
      const requestId = new URL(authorization.headers.get('location')!).searchParams.get('request')!;

      const rejected = await consent(formRequest(`${appUrl}/api/oauth/authorize`, {
         request: requestId, username: 'admin', password: 'incorrect', decision: 'approve',
      }));

      expect(rejected.status).toBe(303);
      const approvalUrl = new URL(rejected.headers.get('location')!);
      expect(approvalUrl.pathname).toBe('/api/oauth/approve');
      expect(approvalUrl.searchParams.get('error')).toBe('incorrect_credentials');
   });

   it('returns an OAuth metadata error for malformed or oversized DCR JSON', async () => {
      const malformed = await registerClient(new Request(`${appUrl}/api/oauth/register`, {
         method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
      }));
      expect(malformed.status).toBe(400);
      await expect(malformed.json()).resolves.toMatchObject({ error: 'invalid_client_metadata' });

      const oversized = await registerClient(jsonRequest(`${appUrl}/api/oauth/register`, {
         client_name: 'x'.repeat(17_000), redirect_uris: [redirectUri],
      }));
      expect(oversized.status).toBe(400);
      await expect(oversized.json()).resolves.toMatchObject({ error: 'invalid_client_metadata' });
   });

   it('returns OAuth CORS headers on dynamic registration preflight', async () => {
      const response = registerOptions();

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-max-age')).toBe('86400');
   });

   it('keeps OAuth CORS headers on JSON method errors too', async () => {
      const response = await registerGet(new Request(`${appUrl}/api/oauth/register`));

      expect(response.status).toBe(405);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
   });

   it('revokes the active grant when a rotated refresh token is replayed', async () => {
      const now = Date.now();
      await withOAuthStore((store) => {
         store.credentials = [
            { tokenHash: hashSecret('old-refresh'), kind: 'refresh_token', clientId: 'client', grantId: 'grant-replay', revokedAt: now - 1, expiresAt: now + 1000, createdAt: now - 1 },
            { tokenHash: hashSecret('live-access'), kind: 'access_token', clientId: 'client', grantId: 'grant-replay', expiresAt: now + 1000, createdAt: now },
            { tokenHash: hashSecret('live-refresh'), kind: 'refresh_token', clientId: 'client', grantId: 'grant-replay', expiresAt: now + 1000, createdAt: now },
         ];
      });

      const response = await token(formRequest(`${appUrl}/api/oauth/token`, {
         grant_type: 'refresh_token', client_id: 'client', refresh_token: 'old-refresh',
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' });
      expect((await findCredential('live-access', 'access_token'))?.revokedAt).toEqual(expect.any(Number));
      expect((await findCredential('live-refresh', 'refresh_token'))?.revokedAt).toEqual(expect.any(Number));
   });
});
