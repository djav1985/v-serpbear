import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
/* eslint-disable security/detect-non-literal-fs-filename -- the path is fixed to the app's data directory, not user input. */
import { mkdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { atomicWriteFile } from './atomicWrite';
import { readTextUpTo } from './api/http';
import { withFileLock } from './fileLock';

export const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const OAUTH_ACCESS_TTL_SECONDS = 24 * 60 * 60;
export const OAUTH_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MCP_SCOPE_FULL = 'mcp:full';
export const MCP_SCOPE_READ = 'mcp:read';
export const MCP_SCOPES = [MCP_SCOPE_FULL, MCP_SCOPE_READ] as const;
export type McpOAuthScope = typeof MCP_SCOPES[number];
const MAX_REDIRECT_URIS = 8;
const MAX_OAUTH_CLIENTS = 500;
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

export type OAuthClient = {
   clientId: string;
   clientName: string | null;
   redirectUris: string[];
   createdAt: number;
   hasGrant?: boolean;
};

export type OAuthCredentialKind = 'authorization_code' | 'access_token' | 'refresh_token' | 'authorization_request';

export type OAuthCredential = {
   tokenHash: string;
   kind: OAuthCredentialKind;
   clientId: string;
   grantId?: string | null;
   redirectUri?: string | null;
   codeChallenge?: string | null;
   state?: string | null;
   resource?: string | null;
   scope?: McpOAuthScope | null;
   expiresAt: number;
   revokedAt?: number | null;
   createdAt: number;
};

export type OAuthStore = { clients: OAuthClient[], credentials: OAuthCredential[] };

const storePath = (): string => join(process.cwd(), 'data', 'mcp_oauth.json');
const emptyStore = (): OAuthStore => ({ clients: [], credentials: [] });

const parseStore = (raw: string): OAuthStore => {
   const parsed = JSON.parse(raw) as Partial<OAuthStore>;
   if (parsed.clients === undefined && parsed.credentials === undefined) { return emptyStore(); }
   if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.credentials)) { throw new Error('OAuth store has an invalid shape.'); }
   return parsed as OAuthStore;
};

const readStore = async (): Promise<OAuthStore> => {
   try {
      return parseStore(await readFile(storePath(), 'utf8'));
   } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') { return emptyStore(); }
      throw error;
   }
};

/** Serialize all OAuth state changes and atomically replace the adjacent data file. */
export const withOAuthStore = async <T>(mutate: (store: OAuthStore) => Promise<T> | T): Promise<T> => {
   const path = storePath();
   await mkdir(dirname(path), { recursive: true });
   return withFileLock(path, async () => {
      const store = await readStore();
      const result = await mutate(store);
      await atomicWriteFile(path, JSON.stringify(store), 'utf8');
      return result;
   });
};

export const randomSecret = (): string => randomBytes(32).toString('base64url');
export const randomIdentifier = (): string => randomUUID();
export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export const constantTimeEqual = (candidate: string, expected: string | undefined): boolean => {
   if (!expected) { return false; }
   const candidateBytes = Buffer.from(candidate, 'utf8');
   const expectedBytes = Buffer.from(expected, 'utf8');
   return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
};

/** Uses the configured public URL only; never derive OAuth identifiers from the incoming Host header. */
export const getOAuthBaseUrl = (): string | null => {
   const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
   if (!configured) { return null; }
   try {
      const url = new URL(configured);
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== '/') { return null; }
      return url.origin;
   } catch (_error) {
      return null;
   }
};

export const getMcpResourceUrl = (): string | null => {
   const base = getOAuthBaseUrl();
   return base ? `${base}/api/mcp` : null;
};

export const getAuthorizationServerMetadata = () => {
   const issuer = getOAuthBaseUrl();
   if (!issuer) { return null; }
   return {
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [...MCP_SCOPES],
      revocation_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: false,
   };
};

export const getProtectedResourceMetadata = () => {
   const resource = getMcpResourceUrl();
   const issuer = getOAuthBaseUrl();
   if (!resource || !issuer) { return null; }
   return { resource, authorization_servers: [issuer], scopes_supported: [...MCP_SCOPES], bearer_methods_supported: ['header'] };
};

/** Match the example server: unknown scopes are ignored and full access is the default. */
export const getScopeFromRequest = (requested: string | null): McpOAuthScope => {
   const scopes = (requested ?? '').split(/[\s+]+/).filter(Boolean);
   if (scopes.includes(MCP_SCOPE_FULL)) { return MCP_SCOPE_FULL; }
   return scopes.includes(MCP_SCOPE_READ) ? MCP_SCOPE_READ : MCP_SCOPE_FULL;
};

export const oauthCorsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version',
   'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
   'Access-Control-Max-Age': '86400',
};

export const oauthOptions = (): Response => new Response(null, { status: 204, headers: oauthCorsHeaders });

export const oauthError = (error: string, status = 400, description?: string, headers?: HeadersInit): Response => Response.json(
   { error, ...(description ? { error_description: description } : {}) },
   { status, headers: { ...oauthCorsHeaders, 'Cache-Control': 'no-store', Pragma: 'no-cache', ...Object.fromEntries(new Headers(headers).entries()) } },
);

export const oauthSuccess = (body: unknown, status = 200): Response => Response.json(body, {
   status,
   headers: { ...oauthCorsHeaders, 'Cache-Control': 'no-store', Pragma: 'no-cache' },
});

export const readOAuthForm = async (req: Request, maxBytes = 32 * 1024): Promise<URLSearchParams | null> => {
   const length = Number(req.headers.get('content-length'));
   if (Number.isFinite(length) && length > maxBytes) { return null; }
   const text = await readTextUpTo(req.body, maxBytes);
   return text === null ? null : new URLSearchParams(text);
};

/** OAuth token and revocation clients may send either form data or JSON. */
export const readOAuthFormOrJson = async (req: Request, maxBytes = 16 * 1024): Promise<URLSearchParams | null> => {
   const length = Number(req.headers.get('content-length'));
   if (Number.isFinite(length) && length > maxBytes) { return null; }
   const text = await readTextUpTo(req.body, maxBytes);
   if (text === null) { return null; }
   if ((req.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
      try {
         const body = JSON.parse(text) as unknown;
         if (!body || typeof body !== 'object' || Array.isArray(body)) { return null; }
         const params = new URLSearchParams();
         Object.entries(body as Record<string, unknown>).forEach(([key, value]) => {
            if (value !== null && value !== undefined) { params.set(key, String(value)); }
         });
         return params;
      } catch (_error) {
         return null;
      }
   }
   return new URLSearchParams(text);
};

export const bearerValue = (req: Request): string | null => {
   const header = req.headers.get('authorization') ?? '';
   return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : null;
};

export const parseRedirectUris = (value: unknown): string[] | null => {
   if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REDIRECT_URIS) { return null; }
   const result: string[] = [];
   for (const uri of value) {
      if (typeof uri !== 'string' || uri.length > 2048) { return null; }
      try {
         const parsed = new URL(uri);
         const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
         if (parsed.hash) { return null; }
         if (parsed.protocol === 'https:') {
            if (!parsed.hostname) { return null; }
         } else if (parsed.protocol === 'http:') {
            if (!loopback) { return null; }
         } else if (/^(javascript|data|file|blob|about|vbscript|ws|wss|ftp):$/.test(parsed.protocol) || !/^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol)) {
            return null;
         }
         result.push(uri);
      } catch (_error) {
         return null;
      }
   }
   return result;
};

export const createClient = async (clientName: string | null, redirectUris: string[]): Promise<OAuthClient | null> => {
   const client: OAuthClient = {
      clientId: `serpbear_${randomSecret()}`,
      clientName: clientName?.slice(0, 80) || null,
      redirectUris,
      createdAt: Date.now(),
   };
   return withOAuthStore((store) => {
      const cutoff = Date.now() - UNUSED_CLIENT_TTL_MS;
      const clientsWithGrants = new Set(store.credentials
         .filter((credential) => credential.kind === 'access_token' || credential.kind === 'refresh_token')
         .map((credential) => credential.clientId));
      store.clients = store.clients.filter((existing) => existing.createdAt >= cutoff || existing.hasGrant || clientsWithGrants.has(existing.clientId));
      if (store.clients.length >= MAX_OAUTH_CLIENTS) { return null; }
      store.clients.push(client);
      return client;
   });
};

export const readClient = async (clientId: string): Promise<OAuthClient | null> => {
   const store = await readStore();
   return store.clients.find((client) => client.clientId === clientId) ?? null;
};

export const getClientRedirectUris = (client: OAuthClient): string[] => client.redirectUris;

export type OAuthCredentialInput = Omit<OAuthCredential, 'createdAt'> & { createdAt?: number };

export const saveCredential = async (credential: OAuthCredentialInput): Promise<OAuthCredential> => {
   const record: OAuthCredential = { ...credential, createdAt: credential.createdAt ?? Date.now() };
   await withOAuthStore((store) => { store.credentials.push(record); });
   return record;
};

export const findCredential = async (secret: string, kind: OAuthCredentialKind): Promise<OAuthCredential | null> => {
   const tokenHash = hashSecret(secret);
   const store = await readStore();
   return store.credentials.find((credential) => credential.tokenHash === tokenHash && credential.kind === kind) ?? null;
};

export const findActiveAuthorizationRequest = async (requestId: string): Promise<OAuthCredential | null> => {
   const pending = await findCredential(requestId, 'authorization_request');
   return pending && pending.expiresAt > Date.now() && pending.revokedAt == null ? pending : null;
};

export const verifyPkce = (verifier: string, challenge: string): boolean => {
   const actual = createHash('sha256').update(verifier).digest('base64url');
   return constantTimeEqual(actual, challenge);
};

export const pruneExpiredOAuthCredentials = async (): Promise<void> => {
   await withOAuthStore((store) => { store.credentials = store.credentials.filter((credential) => credential.expiresAt > Date.now()); });
};

/** Revoke an OAuth grant when any access token or current/previous refresh token is presented. */
export const revokeOAuthGrantFromToken = async (token: string): Promise<boolean> => withOAuthStore((store) => {
   const tokenHash = hashSecret(token);
   const credential = store.credentials.find((item) => item.tokenHash === tokenHash &&
      (item.kind === 'access_token' || item.kind === 'refresh_token'));
   if (!credential?.grantId) { return false; }
   let revoked = false;
   store.credentials.forEach((item) => {
      if (item.grantId === credential.grantId && item.revokedAt == null) {
         item.revokedAt = Date.now();
         revoked = true;
      }
   });
   return revoked;
});
