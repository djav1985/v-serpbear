import type { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/mcp/route';
import { createMockRequest, createMockResponse } from '../__helpers__';
const handler = asHandler(handlerRoute);

const mockToolHandlers = new Map<string, (input: any) => Promise<unknown>>();
const mockTransportHandleRequest = jest.fn();
const mockTransportClose = jest.fn();
const mockServerClose = jest.fn();
const mockServerConnect = jest.fn();

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: (name: string, _config: unknown, handler: (input: any) => Promise<unknown>) => mockToolHandlers.set(name, handler),
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
  const originalMcpApiKey = process.env.MCP_API_KEY;
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
      process.env.APIKEY = 'test-key';
      process.env.MCP_API_KEY = 'test-key';
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
      if (originalMcpApiKey === undefined) delete process.env.MCP_API_KEY;
      else process.env.MCP_API_KEY = originalMcpApiKey;
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

    it('returns 500 for an authorized POST when APIKEY is unset', async () => {
      delete process.env.APIKEY;

      const res = await call('POST');

      expect(res.status).toHaveBeenCalledWith(500);
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

    it('registers the public tools and routes a tool call to the matching local API with the bearer key', async () => {
      const previousFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ keywords: [{ ID: 7 }] }),
      }) as unknown as typeof fetch;
      mockTransportHandleRequest.mockResolvedValue(new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      try {
        const res = await call('POST');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockToolHandlers.size).toBe(6);
        const reply = await mockToolHandlers.get('list_keywords')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword')!({ id: '7' });
        await mockToolHandlers.get('list_domains')!({ withstats: true });
        await mockToolHandlers.get('get_searchconsole')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_insight')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword_ideas')!({ domain: 'example.com' });
        await mockToolHandlers.get('get_keyword_ideas')!({});

        const calls = (global.fetch as jest.Mock).mock.calls;
        const urls = calls.map(([url]) => String(url));
        expect(urls).toEqual([
          'http://127.0.0.1:3200/api/serp/keywords?domain=example.com',
          'http://127.0.0.1:3200/api/serp/keyword?id=7',
          'http://127.0.0.1:3200/api/serp/domains?withstats=true',
          'http://127.0.0.1:3200/api/google/searchconsole?domain=example.com',
          'http://127.0.0.1:3200/api/google/insight?domain=example.com',
          'http://127.0.0.1:3200/api/google/ideas?domain=example.com',
          'http://127.0.0.1:3200/api/google/ideas',
        ]);
        const options = calls[0][1];
        expect(options).toEqual({ method: 'GET', headers: { Authorization: 'Bearer test-key', Accept: 'application/json' }, body: undefined });
        expect(reply).toEqual({ isError: false, content: [{ type: 'text', text: '{\n  "keywords": [\n    {\n      "ID": 7\n    }\n  ]\n}' }] });
        expect(mockServerConnect).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(mockTransportClose).toHaveBeenCalledTimes(1);
        expect(mockServerClose).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = previousFetch;
      }
    });

    it('marks failed local API calls as tool errors and preserves non-JSON response text', async () => {
      const previousFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'upstream unavailable' }) as unknown as typeof fetch;
      mockTransportHandleRequest.mockResolvedValue(new Response('', { status: 200 }));

      try {
        await call('POST');
        const reply = await mockToolHandlers.get('list_domains')!({ withstats: false });

        const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
        expect(String(url)).toBe('http://127.0.0.1:3200/api/serp/domains');
        expect(options.method).toBe('GET');
        expect(reply).toEqual({ isError: true, content: [{ type: 'text', text: '"upstream unavailable"' }] });
      } finally {
        global.fetch = previousFetch;
      }
    });
  });
});
