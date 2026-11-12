import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { Agent } from 'undici';
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
export const OAUTH_ACCESS_TOKEN_PREFIX = 'mcpa_';
export const OAUTH_REFRESH_TOKEN_PREFIX = 'mcpr_';
export const OAUTH_CODE_PREFIX = 'mcpc_';
const SERPBEAR_REPOSITORY = 'https://github.com/djav1985/v-serpbear';
const MAX_REDIRECT_URIS = 8;
const MAX_OAUTH_CLIENTS = 500;
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;
const CIMD_MAX_BYTES = 5 * 1024;
const CIMD_FETCH_TIMEOUT_MS = 5_000;

/** The whole MCP integration can be disabled independently of direct/OAuth auth modes. */
export const isMcpEnabled = (): boolean => !/^(0|false|no|off)$/i.test(process.env.MCP_ENABLED?.trim() ?? '');
/** OAuth remains opt-in while MCP itself is enabled. */
export const isMcpOAuthEnabled = (): boolean => isMcpEnabled() && /^(1|true|yes|on)$/i.test(process.env.MCP_OAUTH?.trim() ?? '');
export const oauthDisabledResponse = (): Response => Response.json({ error: 'not_found' }, { status: 404 });
export const oauthOptionsWhenEnabled = (): Response => isMcpOAuthEnabled()
   ? oauthOptions()
   : oauthDisabledResponse();

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

export const randomSecret = (prefix = ''): string => `${prefix}${randomBytes(32).toString('base64url')}`;
export const randomIdentifier = (): string => randomBytes(8).toString('hex');
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
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [...MCP_SCOPES],
      revocation_endpoint_auth_methods_supported: ['none'],
      service_documentation: SERPBEAR_REPOSITORY,
   };
};

export const getProtectedResourceMetadata = () => {
   const resource = getMcpResourceUrl();
   const issuer = getOAuthBaseUrl();
   if (!resource || !issuer) { return null; }
   return {
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [...MCP_SCOPES],
      resource_name: 'serpbear',
      resource_documentation: SERPBEAR_REPOSITORY,
   };
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
   { status, headers: { ...oauthCorsHeaders, 'Cache-Control': 'no-store', ...Object.fromEntries(new Headers(headers).entries()) } },
);

export const oauthSuccess = (body: unknown, status = 200): Response => Response.json(body, {
   status,
   headers: { ...oauthCorsHeaders, 'Cache-Control': 'no-store' },
});

export const oauthDiscoveryResponse = (metadata: unknown | null): Response => {
   if (!isMcpOAuthEnabled()) { return oauthDisabledResponse(); }
   if (!metadata) { return oauthError('server_error', 503, 'Set NEXT_PUBLIC_APP_URL to the public HTTPS URL of this server.'); }
   return oauthSuccess(metadata);
};

const htmlEscape = (value: string): string => value
   .replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');

/** HTML error response used when an authorization request has no trusted callback. */
export const oauthHtmlError = (title: string, detail: string, status = 400): Response => new Response(
   `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${htmlEscape(title)} · SerpBear</title></head><body><main><h1>${htmlEscape(title)}</h1><p>${htmlEscape(detail)}</p><p>Server: SerpBear · <a href="${SERPBEAR_REPOSITORY}">documentation</a></p></main></body></html>`,
   {
      status,
      headers: {
         'Content-Type': 'text/html; charset=utf-8',
         'Cache-Control': 'no-store',
         'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
         'X-Content-Type-Options': 'nosniff',
         'Referrer-Policy': 'no-referrer',
      },
   },
);

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
         return new URLSearchParams(text);
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
      clientId: randomBytes(16).toString('hex'),
      clientName: clientName === null ? null : clientName.slice(0, 80),
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

const isPublicIpv4 = (address: string): boolean => {
   const octets = address.split('.').map(Number);
   if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) { return false; }
   const [a, b, c] = octets;
   return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
   );
};

const ipv6Words = (address: string): number[] | null => {
   let value = address.toLowerCase().split('%')[0];
   if (value.includes('.')) {
      const lastColon = value.lastIndexOf(':');
      const ipv4 = value.slice(lastColon + 1);
      if (!isPublicIpv4(ipv4)) { return null; }
      const octets = ipv4.split('.').map(Number);
      value = `${value.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
   }
   const halves = value.split('::');
   if (halves.length > 2) { return null; }
   const parseHalf = (half: string) => half ? half.split(':').map((word) => /^[\da-f]{1,4}$/.test(word) ? Number.parseInt(word, 16) : Number.NaN) : [];
   const left = parseHalf(halves[0]);
   const right = parseHalf(halves[1] ?? '');
   const missing = 8 - left.length - right.length;
   if (left.some(Number.isNaN) || right.some(Number.isNaN) || missing < 0 || (halves.length === 1 && missing !== 0)) { return null; }
   return [...left, ...Array.from({ length: missing }, () => 0), ...right];
};

const isPublicAddress = (address: string, family: number): boolean => {
   if (family === 4) { return isPublicIpv4(address); }
   if (family !== 6) { return false; }
   const words = ipv6Words(address);
   if (!words) { return false; }
   if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      return isPublicIpv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
   }
   const first = words[0];
   const second = words[1];
   // Only global unicast space is accepted. Exclude documentation and tunnelling prefixes.
   return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && (second === 0xdb8 || second === 0)) && first !== 0x2002;
};

const parseCimdUrl = (clientId: string): URL | null => {
   if (clientId.length > 2048) { return null; }
   try {
      const url = new URL(clientId);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) { return null; }
      const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) { return null; }
      const family = isIP(hostname);
      if (family && !isPublicAddress(hostname, family)) { return null; }
      return url;
   } catch (_error) {
      return null;
   }
};

const isJsonMediaType = (contentType: string | null): boolean => {
   const mediaType = (contentType ?? '').split(';', 1)[0].trim().toLowerCase();
   return mediaType === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType);
};

const fetchCimdClient = async (clientId: string): Promise<OAuthClient | null> => {
   const url = parseCimdUrl(clientId);
   if (!url) { return null; }
   try {
      const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true });
      if (!addresses.length || addresses.some(({ address, family }) => !isPublicAddress(address, family))) { return null; }
      const pinnedAddress = addresses[0];
      const agent = new Agent({
         connect: {
            lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
               if (options?.all) { callback(null, [pinnedAddress]); }
               else { callback(null, pinnedAddress.address, pinnedAddress.family); }
            }) as never,
         },
      });
      try {
         const response = await fetch(clientId, {
            redirect: 'error',
            signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
            dispatcher: agent,
         } as RequestInit & { dispatcher: Agent });
         if (response.status !== 200 || !isJsonMediaType(response.headers.get('content-type'))) { return null; }
         const length = Number(response.headers.get('content-length'));
         if (Number.isFinite(length) && length > CIMD_MAX_BYTES) { return null; }
         const body = await readTextUpTo(response.body, CIMD_MAX_BYTES);
         if (body === null) { return null; }
         let metadata: unknown;
         try { metadata = JSON.parse(body); }
         catch (_error) { return null; }
         if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) { return null; }
         const document = metadata as Record<string, unknown>;
         if (document.client_id !== clientId) { return null; }
         const redirectUris = parseRedirectUris(document.redirect_uris);
         if (!redirectUris) { return null; }
         const methods = document.token_endpoint_auth_methods_supported;
         const supportsNone = Array.isArray(methods)
            ? methods.includes('none')
            : document.token_endpoint_auth_method === 'none';
         if (!supportsNone) { return null; }
         return {
            clientId,
            clientName: typeof document.client_name === 'string' ? document.client_name.slice(0, 80) : null,
            redirectUris,
            createdAt: Date.now(),
         };
      } finally {
         await agent.close();
      }
   } catch (_error) {
      return null;
   }
};

/** Resolves existing DCR clients first, then validates CIMD URLs as HTTPS-hosted metadata documents. */
export const resolveOAuthClient = async (clientId: string): Promise<OAuthClient | null> => {
   const registered = await readClient(clientId);
   return registered ?? fetchCimdClient(clientId);
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
   if (verifier.length < 43 || verifier.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(verifier)) { return false; }
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
