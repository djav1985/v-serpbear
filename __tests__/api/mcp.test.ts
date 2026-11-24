import type { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/mcp/route';
import { createMockRequest, createMockResponse } from '../__helpers__';
import { getInternalRequestScope } from '../../utils/mcpInternalAuth';
import { z } from 'zod';
import { parseBody, parseQuery } from '../../utils/api/validate';
import { endpoints, type EndpointKey } from '../../utils/api/contracts';
const handler = asHandler(handlerRoute);

const mockToolHandlers = new Map<string, (input: any) => Promise<unknown>>();
const mockToolConfigs = new Map<string, { inputSchema: z.ZodRawShape }>();
const mockTransportHandleRequest = jest.fn();
const mockTransportClose = jest.fn();
const mockServerClose = jest.fn();
const mockServerConnect = jest.fn();
const mockFindCredential = jest.fn();

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
// The tools run these handlers in process. Each is a stub that records the Request it was given.
const mockRouteCalls: Array<{ method: string; request: Request }> = [];
let mockRouteResponse: () => Response = () => Response.json({ data: {}, error: null });
// A function declaration, so the hoisted jest.mock factories can refer to it before the consts above are initialized
function mockRouteHandler(method: string) {
  return async (request: Request) => {
    mockRouteCalls.push({ method, request });
    return mockRouteResponse();
  };
}
jest.mock('../../app/api/serp/keyword/route', () => ({ GET: mockRouteHandler('GET') }));
jest.mock('../../app/api/serp/keywords/route', () => ({ GET: mockRouteHandler('GET'), POST: mockRouteHandler('POST'), PUT: mockRouteHandler('PUT'), DELETE: mockRouteHandler('DELETE') }));
jest.mock('../../app/api/serp/domains/route', () => ({ GET: mockRouteHandler('GET') }));
jest.mock('../../app/api/serp/refresh/route', () => ({ POST: mockRouteHandler('POST') }));
jest.mock('../../app/api/google/searchconsole/route', () => ({ GET: mockRouteHandler('GET') }));
jest.mock('../../app/api/google/insight/route', () => ({ GET: mockRouteHandler('GET') }));
jest.mock('../../app/api/google/ideas/route', () => ({ GET: mockRouteHandler('GET'), POST: mockRouteHandler('POST'), PUT: mockRouteHandler('PUT') }));
jest.mock('../../utils/mcpOAuth', () => ({
  ...jest.requireActual('../../utils/mcpOAuth'),
  findCredential: (...args: unknown[]) => mockFindCredential(...args),
}));
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: (name: string, config: { inputSchema: z.ZodRawShape }, handler: (input: any) => Promise<unknown>) => { mockToolConfigs.set(name, config); mockToolHandlers.set(name, handler); },
    connect: mockServerConnect,
    close: mockServerClose,
  })),
}));
jest.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: mockTransportHandleRequest,
    close: mockTransportClose,
  })),
}));

describe('MCP route', () => {
  const originalApiKey = process.env.APIKEY;
  const originalMcpApiKey = process.env.MCP_APIKEY;
  const originalMcpOAuth = process.env.MCP_OAUTH;
  const originalPort = process.env.PORT;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  const call = async (method: string, headers: Record<string, string> = { authorization: 'Bearer test-key' }) => {
    const req = createMockRequest({
      method,
      body: {},
      headers,
      socket: { localPort: 3000 },
    } as unknown as Partial<NextApiRequest>);
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return res;
  };

  describe('/api/mcp', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockToolHandlers.clear();
      mockToolConfigs.clear();
      mockRouteCalls.length = 0;
      mockRouteResponse = () => Response.json({ data: {}, error: null });
      process.env.APIKEY = 'test-key';
      process.env.MCP_APIKEY = 'test-key';
      process.env.MCP_OAUTH = 'true';
      process.env.PORT = '3200';
      process.env.NEXT_PUBLIC_APP_URL = 'https://serpbear.example';
    });

    afterEach(() => {
      if (originalApiKey === undefined) {
        delete process.env.APIKEY;
      } else {
        process.env.APIKEY = originalApiKey;
      }
      if (originalMcpApiKey === undefined) delete process.env.MCP_APIKEY;
      else process.env.MCP_APIKEY = originalMcpApiKey;
      if (originalMcpOAuth === undefined) delete process.env.MCP_OAUTH;
      else process.env.MCP_OAUTH = originalMcpOAuth;
      if (originalPort === undefined) delete process.env.PORT;
      else process.env.PORT = originalPort;
      if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    });

    it('returns 405 for a GET request', async () => {
      const res = await call('GET');

      expect(res.status).toHaveBeenCalledWith(405);
    });

    it.each([
      ['no Authorization header', { cookie: 'token=anything' }],
      ['a wrong Bearer key', { authorization: 'Bearer wrong-key' }],
      ['a non-Bearer scheme', { authorization: 'Basic test-key' }],
    ])('returns 401 when the request has %s, even with a session cookie', async (_name, headers) => {
      const res = await call('POST', headers as Record<string, string>);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('challenges unauthenticated GET requests with root protected-resource metadata', async () => {
      const res = await call('GET', {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.setHeader).toHaveBeenCalledWith('www-authenticate', 'Bearer resource_metadata="https://serpbear.example/.well-known/oauth-protected-resource"');
    });

    it('does not need APIKEY: an authorized POST still reaches the transport', async () => {
      delete process.env.APIKEY;
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));

      const res = await call('POST');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockServerConnect).toHaveBeenCalledTimes(1);
    });

    it('refuses an OAuth credential that has no scope or an unknown one, instead of granting full access', async () => {
      for (const scope of [undefined, null, '', 'mcp:admin']) {
        mockToolHandlers.clear();
        mockFindCredential.mockResolvedValue({ scope, revokedAt: null, expiresAt: Date.now() + 60_000 });

        const res = await call('POST', { authorization: 'Bearer oauth-no-scope-token' });

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mockToolHandlers.size).toBe(0);
      }
      expect(mockServerConnect).not.toHaveBeenCalled();
    });

    it('matches the example challenge on unauthenticated OPTIONS and omits MCP CORS headers', async () => {
      const response = await handlerRoute.OPTIONS(new Request('https://serpbear.example/api/mcp', { method: 'OPTIONS' }));

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://serpbear.example/.well-known/oauth-protected-resource"');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('returns 405 with Allow: POST for authenticated OPTIONS requests', async () => {
      const response = await handlerRoute.OPTIONS(new Request('https://serpbear.example/api/mcp', {
        method: 'OPTIONS', headers: { authorization: 'Bearer test-key' },
      }));

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('registers the read tools and runs the matching route handlers in process with the read scope', async () => {
      const previousFetch = global.fetch;
      global.fetch = jest.fn() as unknown as typeof fetch;
      mockRouteResponse = () => Response.json({ data: { keywords: [{ ID: 7 }] }, error: null });
      mockTransportHandleRequest.mockResolvedValue(new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      try {
        const res = await call('POST');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockToolHandlers.size).toBe(6);
        expect(mockToolHandlers.has('generate_keyword_ideas')).toBe(false);
        expect(mockToolHandlers.has('favorite_keyword_idea')).toBe(false);
        expect(mockToolHandlers.has('add_keywords')).toBe(false);
        expect(mockToolHandlers.has('update_keywords')).toBe(false);
        expect(mockToolHandlers.has('delete_keywords')).toBe(false);
        expect(mockToolHandlers.has('refresh_keywords')).toBe(false);
        const reply = await mockToolHandlers.get('list_keywords')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword')!({ id: '7' });
        await mockToolHandlers.get('list_domains')!({ withstats: true });
        await mockToolHandlers.get('get_searchconsole')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_insight')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword_ideas')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword_ideas')!({});

        const urls = mockRouteCalls.map(({ request }) => { const u = new URL(request.url); return `${request.method} ${u.pathname}${u.search}`; });
        expect(urls).toEqual([
          'GET /api/serp/keywords?domain=example.com',
          'GET /api/serp/keyword?id=7',
          'GET /api/serp/domains?withstats=true',
          'GET /api/google/searchconsole?domain=example.com',
          'GET /api/google/insight?domain=example.com',
          'GET /api/google/ideas?domain=example.com',
          'GET /api/google/ideas',
        ]);
        // No network call and no key: each Request is registered with the caller's scope instead
        expect(global.fetch).not.toHaveBeenCalled();
        expect(mockRouteCalls.every(({ request }) => request.headers.get('authorization') === null)).toBe(true);
        expect(mockRouteCalls.every(({ request }) => getInternalRequestScope(request) === 'mcp:read')).toBe(true);
        expect(reply).toEqual({ isError: false, content: [{ type: 'text', text: '{\n  "keywords": [\n    {\n      "ID": 7\n    }\n  ]\n}' }] });
        expect(mockServerConnect).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(mockTransportClose).toHaveBeenCalledTimes(1);
        expect(mockServerClose).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = previousFetch;
      }
    });

    it('turns a response that is not in the envelope into an INVALID_RESPONSE tool error, never passing its body on', async () => {
      mockTransportHandleRequest.mockResolvedValue(new Response('', { status: 200 }));
      await call('POST');
      for (const response of [() => new Response('upstream unavailable', { status: 502 }), () => Response.json({ keywords: [{ ID: 7 }] })]) {
         mockRouteResponse = response;
         const reply = await mockToolHandlers.get('list_domains')!({ withstats: false }) as { isError: boolean, content: { text: string }[] };
         expect(reply.isError).toBe(true);
         expect(JSON.parse(reply.content[0].text)).toEqual({ code: 'INVALID_RESPONSE', message: 'The app answered in an unexpected format.' });
      }
    });

    it('marks a failed route call as a tool error', async () => {
      mockRouteResponse = () => new Response('upstream unavailable', { status: 502 });
      mockTransportHandleRequest.mockResolvedValue(new Response('', { status: 200 }));

      await call('POST');
      const reply = await mockToolHandlers.get('list_domains')!({ withstats: false }) as { isError: boolean };

      expect(mockRouteCalls).toHaveLength(1);
      expect(mockRouteCalls[0].method).toBe('GET');
      expect(new URL(mockRouteCalls[0].request.url).pathname).toBe('/api/serp/domains');
      expect(reply.isError).toBe(true);
    });

    it('gives tools the data of a success envelope, never the envelope', async () => {
      mockRouteResponse = () => Response.json({ data: { keywords: [{ ID: 7 }] }, error: null, requestId: 'rid-1' });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));

      await call('POST');
      const reply = await mockToolHandlers.get('list_keywords')!({ domain: 'example.com' }) as { isError: boolean, content: { text: string }[] };

      expect(reply.isError).toBe(false);
      expect(JSON.parse(reply.content[0].text)).toEqual({ keywords: [{ ID: 7 }] });
    });

    it('maps a failure envelope to a tool error with { code, message, details }', async () => {
      mockRouteResponse = () => Response.json({ data: null, error: { code: 'NOT_FOUND', message: 'Domain not found', details: ['x'] }, requestId: 'rid-2' }, { status: 404 });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));

      await call('POST');
      const reply = await mockToolHandlers.get('list_keywords')!({ domain: 'missing.com' }) as { isError: boolean, content: { text: string }[] };

      expect(reply.isError).toBe(true);
      expect(JSON.parse(reply.content[0].text)).toEqual({ code: 'NOT_FOUND', message: 'Domain not found', details: ['x'] });
    });

    it('returns "not integrated" as a normal tool result for Search Console and insight', async () => {
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));
      await call('POST');

      mockRouteResponse = () => Response.json({ data: { searchConsole: null, integrationStatus: 'not-integrated' }, error: null });
      const searchConsole = await mockToolHandlers.get('get_searchconsole')!({ domain: 'example.com' }) as { isError: boolean, content: { text: string }[] };
      mockRouteResponse = () => Response.json({ data: { insight: null, integrationStatus: 'not-integrated' }, error: null });
      const insight = await mockToolHandlers.get('get_insight')!({ domain: 'example.com' }) as { isError: boolean, content: { text: string }[] };

      expect(searchConsole.isError).toBe(false);
      expect(JSON.parse(searchConsole.content[0].text)).toEqual({ searchConsole: null, integrationStatus: 'not-integrated' });
      expect(insight.isError).toBe(false);
      expect(JSON.parse(insight.content[0].text)).toEqual({ insight: null, integrationStatus: 'not-integrated' });
    });

    it('passes tool string ids through as query values, so get_keyword and favorite_keyword_idea keep their string inputs', async () => {
      mockFindCredential.mockResolvedValue({ scope: 'mcp:full', revokedAt: null, expiresAt: Date.now() + 60_000 });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));
      await call('POST', { authorization: 'Bearer oauth-full-token' });

      await mockToolHandlers.get('get_keyword')!({ id: '7' });
      await mockToolHandlers.get('favorite_keyword_idea')!({ keywordID: 'idea-1' });

      expect(new URL(mockRouteCalls[0].request.url).searchParams.get('id')).toBe('7');
      expect(await mockRouteCalls[1].request.json()).toEqual({ keywordID: 'idea-1' });
    });

    it('builds, for every tool, a request that its endpoint contract accepts (the tool inputs are written by hand, so this catches them drifting)', async () => {
      mockFindCredential.mockResolvedValue({ scope: 'mcp:full', revokedAt: null, expiresAt: Date.now() + 60_000 });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));
      await call('POST', { authorization: 'Bearer oauth-full-token' });

      const samples: Array<[string, Record<string, unknown>, EndpointKey]> = [
        ['get_keyword', { id: '7' }, 'keywords.get'],
        ['list_keywords', { domain: 'example.com' }, 'keywords.list'],
        ['list_domains', {}, 'domains.list'],
        ['list_domains', { withstats: true }, 'domains.list'],
        ['get_searchconsole', { domain: 'example.com' }, 'searchConsole.get'],
        ['get_insight', { domain: 'example.com' }, 'insight.get'],
        ['get_keyword_ideas', {}, 'ideas.get'],
        ['get_keyword_ideas', { domain: 'example.com' }, 'ideas.get'],
        ['generate_keyword_ideas', { seedType: 'auto' }, 'ideas.generate'],
        ['generate_keyword_ideas', { seedType: 'custom', keywords: ['shoes'], country: 'US', language: '1000', domain: 'example.com', seedSCKeywords: true, seedCurrentKeywords: false }, 'ideas.generate'],
        ['favorite_keyword_idea', { keywordID: 'idea-1' }, 'ideas.favorite'],
        ['favorite_keyword_idea', { keywordID: 'idea-1', domain: 'example.com' }, 'ideas.favorite'],
        ['add_keywords', { keywords: [{ keyword: 'shoes', domain: 'example.com' }] }, 'keywords.add'],
        ['add_keywords', { keywords: [{ keyword: 'shoes', domain: 'example.com', device: 'mobile', country: 'US', location: 'Austin,Texas,US', city: 'Austin', state: 'Texas', tags: 'a,b' }] }, 'keywords.add'],
        ['update_keywords', { ids: [1, 2], sticky: true }, 'keywords.update'],
        ['update_keywords', { ids: [1], tags: { 1: ['a', 'b'] } }, 'keywords.update'],
        ['update_keywords', { ids: [1], location: 'Austin,Texas,US', country: 'US' }, 'keywords.update'],
        ['delete_keywords', { ids: [1, 2] }, 'keywords.remove'],
        ['refresh_keywords', { ids: [1, 2] }, 'refresh.start'],
        ['refresh_keywords', { scope: 'domain', domain: 'example.com' }, 'refresh.start'],
        ['refresh_keywords', { scope: 'enabled-domains' }, 'refresh.enabledDomains'],
      ];

      // Every registered tool is covered by a sample
      expect([...new Set(samples.map(([tool]) => tool))].sort()).toEqual([...mockToolHandlers.keys()].sort());

      for (const [tool, input, key] of samples) {
        mockRouteCalls.length = 0;
        expect({ tool, input, accepted: z.object(mockToolConfigs.get(tool)!.inputSchema).safeParse(input).success }).toEqual({ tool, input, accepted: true });
        await mockToolHandlers.get(tool)!(input);
        expect(mockRouteCalls).toHaveLength(1);
        const { request } = mockRouteCalls[0];
        expect({ tool, method: request.method }).toEqual({ tool, method: endpoints[key].method });
        expect({ tool, path: new URL(request.url).pathname }).toEqual({ tool, path: endpoints[key].path });
        // The route's own check, the one it runs before any logic, must accept what the tool sent
        const check = async () => (request.method === 'GET' ? parseQuery(request, key as never) : parseBody(request, key as never));
        await expect(check()).resolves.toBeDefined();
      }
    });

    it('keeps OAuth read scope limited to read tools', async () => {
      mockFindCredential.mockResolvedValue({ scope: 'mcp:read', revokedAt: null, expiresAt: Date.now() + 60_000 });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));

      await call('POST', { authorization: 'Bearer oauth-read-token' });

      expect(mockToolHandlers.size).toBe(6);
      expect(mockToolHandlers.has('generate_keyword_ideas')).toBe(false);
      expect(mockToolHandlers.has('favorite_keyword_idea')).toBe(false);
      expect(mockToolHandlers.has('add_keywords')).toBe(false);
      expect(mockToolHandlers.has('update_keywords')).toBe(false);
      expect(mockToolHandlers.has('delete_keywords')).toBe(false);
      expect(mockToolHandlers.has('refresh_keywords')).toBe(false);
    });

    it('exposes mutation and refresh tools only to OAuth full scope and runs them with the full scope', async () => {
      mockFindCredential.mockResolvedValue({ scope: 'mcp:full', revokedAt: null, expiresAt: Date.now() + 60_000 });
      mockTransportHandleRequest.mockResolvedValue(new Response('{}', { status: 200 }));

      await call('POST', { authorization: 'Bearer oauth-full-token' });

      expect(mockToolHandlers.size).toBe(12);
      await mockToolHandlers.get('favorite_keyword_idea')!({ keywordID: 'idea-1', domain: 'example.com' });
      await mockToolHandlers.get('add_keywords')!({ keywords: [{ keyword: 'new term', domain: 'example.com' }] });
      await mockToolHandlers.get('update_keywords')!({ ids: [11], sticky: true });
      await mockToolHandlers.get('delete_keywords')!({ ids: [11] });
      await mockToolHandlers.get('refresh_keywords')!({ ids: [11] });

      expect(mockRouteCalls.map(({ request }) => [new URL(request.url).pathname, request.method])).toEqual([
        ['/api/google/ideas', 'PUT'],
        ['/api/serp/keywords', 'POST'],
        ['/api/serp/keywords', 'PUT'],
        ['/api/serp/keywords', 'DELETE'],
        ['/api/serp/refresh', 'POST'],
      ]);
      expect(await mockRouteCalls[0].request.json()).toEqual({ keywordID: 'idea-1', domain: 'example.com' });
      expect(await mockRouteCalls[1].request.json()).toEqual({ keywords: [{ keyword: 'new term', domain: 'example.com' }] });
      expect(await mockRouteCalls[2].request.json()).toEqual({ ids: [11], sticky: true });
      expect(await mockRouteCalls[3].request.json()).toEqual({ ids: [11] });
      expect(await mockRouteCalls[4].request.json()).toEqual({ ids: [11] });
      expect(mockRouteCalls.every(({ request }) => getInternalRequestScope(request) === 'mcp:full')).toBe(true);
    });
  });
});
