import { getClientIp } from '../../utils/api/clientIp';
import { redactSecrets, redactUrl } from '../../utils/logRedaction';
import { buildRequest } from '../__helpers__/routeAdapter';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), authEvent: jest.fn() },
}));
jest.mock('../../database/init', () => ({ ensureDatabase: jest.fn().mockResolvedValue(undefined) }));

describe('api logging', () => {
  describe('createRoute', () => {
    const { logger } = require('../../utils/logger') as {
      logger: {
        info: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
        debug: jest.Mock;
      };
    };

    const request = (init: { method?: string; headers?: Record<string, string>; url?: string } = {}) => (
      new Request(init.url ?? 'http://localhost:3000/api/test', { method: init.method ?? 'GET', headers: init.headers })
    );
    const ok = async () => Response.json({ ok: true });
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      process.env = { ...originalEnv };
      jest.clearAllMocks();
      delete process.env.LOG_LEVEL;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('logs request details at debug level only when LOG_LEVEL is DEBUG (case-insensitive)', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { GET } = createRoute({ name: 'test', auth: false, GET: ok });

      process.env.LOG_LEVEL = 'DEBUG';
      await GET(request());
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[API] Request Details'),
        expect.objectContaining({ method: 'GET', url: '/api/test', body: undefined }),
      );

      // Without DEBUG, request details are not passed to the logger
      delete process.env.LOG_LEVEL;
      logger.debug.mockClear();
      await GET(request());
      expect(logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('[API] Request Details'), expect.anything());
    });

    it('puts the route name in the log lines and a request id on the response', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { GET } = createRoute({ name: 'test-route', auth: false, GET: ok });

      const response = await GET(request());

      expect(response.headers.get('X-Request-Id')).toEqual(expect.any(String));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringMatching(/^\[API\].*\[test-route\]/));
    });

    it('gives the handler the same request id that the response carries', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      let seen: string | undefined;
      const { GET } = createRoute({ name: 'test', auth: false, GET: async (_req, ctx) => { seen = ctx.requestId; return Response.json({}); } });

      const response = await GET(request());

      expect(seen).toEqual(expect.stringMatching(/^\d+-[a-z0-9]+$/));
      expect(response.headers.get('X-Request-Id')).toBe(seen);
    });

    it('logs client errors at DEBUG and server errors at ERROR', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { GET } = createRoute({ name: 'test', auth: false, GET: async () => new Response('gone', { status: 404 }) });
      await GET(request());
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/test'),
        expect.objectContaining({ statusCode: 404 }),
      );
      expect(logger.error).not.toHaveBeenCalled();

      const failing = createRoute({ name: 'test', auth: false, GET: async () => new Response('bad', { status: 502 }) });
      await failing.GET(request());
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('- 502'), undefined, expect.objectContaining({ statusCode: 502 }));
    });

    it('calls ensureDatabase before executing the handler', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { ensureDatabase } = require('../../database/init') as { ensureDatabase: jest.Mock };
      const handler = jest.fn(ok);
      const { GET } = createRoute({ name: 'test', auth: false, GET: handler });

      await GET(request());

      expect(ensureDatabase).toHaveBeenCalled();
      expect(ensureDatabase.mock.invocationCallOrder[0]).toBeLessThan(handler.mock.invocationCallOrder[0]);
    });

    it('answers 500 in the shared error shape when a handler throws, and 400 for an ApiError', async () => {
      const { createRoute, ApiError } = await import('../../utils/apiLogging');
      const boom = createRoute({ name: 'test', auth: false, GET: async () => { throw new Error('boom'); } });
      const response = await boom.GET(request());
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: { code: 'INTERNAL_SERVER_ERROR' }, requestId: expect.any(String) });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Exception'), expect.any(Error), expect.anything());

      const bad = createRoute({ name: 'test', auth: false, POST: async () => { throw new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON'); } });
      const badResponse = await bad.POST(request({ method: 'POST' }));
      expect(badResponse.status).toBe(400);
      expect(await badResponse.json()).toMatchObject({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
    });

    it('answers 405 with an Allow header for a method the route does not define', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { POST, GET } = createRoute({ name: 'test', auth: false, GET: ok });

      const response = await POST(request({ method: 'POST' }));

      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
      expect(await response.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
      expect((await GET(request())).status).toBe(200);
    });

    it('answers 401 before the handler runs unless auth is turned off', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const handler = jest.fn(ok);
      process.env.SECRET = 'secret';
      const { GET } = createRoute({ name: 'test', GET: handler });

      const response = await GET(request());

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('reads a JSON body once and answers 400 when it is not valid JSON', async () => {
      const { readJson } = await import('../../utils/apiLogging');
      const good = new Request('http://localhost/api/test', { method: 'POST', body: '{"a":1}' });
      expect(await readJson(good)).toEqual({ a: 1 });
      expect(await readJson(good)).toEqual({ a: 1 });
      expect(await readJson(new Request('http://localhost/api/test', { method: 'POST' }))).toBeUndefined();
      await expect(readJson(new Request('http://localhost/api/test', { method: 'POST', body: '{nope' }))).rejects.toMatchObject({ status: 400 });
    });

    it('refuses a locked address only for Bearer attempts without a valid session', async () => {
      const { createRoute } = await import('../../utils/apiLogging');
      const { recordLoginFailure, resetLoginThrottle } = await import('../../utils/loginThrottle');
      const { getApiKeyAttemptKeys } = await import('../../utils/apiKeyThrottle');
      const handler = jest.fn(ok);
      const { GET } = createRoute({ name: 'test', auth: false, GET: handler });
      // The client address comes from X-Forwarded-For, which is read only behind a configured proxy
      process.env.TRUST_PROXY = '1';
      const build = (authorization: string) => request({ headers: { authorization, 'x-forwarded-for': '198.51.100.7' } });
      resetLoginThrottle();
      const keys = getApiKeyAttemptKeys(build('Bearer x'));
      for (let i = 0; i < 6; i += 1) { recordLoginFailure(keys); }

      const bearer = await GET(build('Bearer wrong'));
      expect(bearer.status).toBe(429);
      expect(bearer.headers.get('Retry-After')).toBe('900');
      expect(handler).not.toHaveBeenCalled();

      const basic = await GET(build('Basic dXNlcjpwYXNz'));
      expect(basic.status).toBe(200);
      resetLoginThrottle();
      delete process.env.TRUST_PROXY;
    });
  });

  describe('redactSecrets', () => {
    it('redacts passwords, tokens, API keys and private keys', () => {
      expect(redactSecrets({
        password: 'a', smtp_password: 'b', scraping_api: 'c', refresh_token: 'd', private_key: 'e', apiKey: 'f', adwords_client_secret: 'g', Authorization: 'h',
      })).toEqual({
        password: '[REDACTED]', smtp_password: '[REDACTED]', scraping_api: '[REDACTED]', refresh_token: '[REDACTED]', private_key: '[REDACTED]', apiKey: '[REDACTED]', adwords_client_secret: '[REDACTED]', Authorization: '[REDACTED]',
      });
    });

    it('does not treat keyword fields as secrets', () => {
      expect(redactSecrets({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' }))
        .toEqual({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' });
    });

    it('walks nested objects and arrays, and leaves empty strings and non-strings alone', () => {
      expect(redactSecrets({ settings: { smtp_password: 'x', smtp_port: 587 }, list: [{ token: 't' }], password: '' }))
        .toEqual({ settings: { smtp_password: '[REDACTED]', smtp_port: 587 }, list: [{ token: '[REDACTED]' }], password: '' });
    });

    it('redacts extra keys such as the OAuth code and state only when asked', () => {
      expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' })).toEqual({ code: 'abc', state: 'xyz', domain: 'a.com' });
      expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' }, ['code', 'state'])).toEqual({ code: '[REDACTED]', state: '[REDACTED]', domain: 'a.com' });
    });

    it('does not change the input', () => {
      const input = { password: 'a' };
      redactSecrets(input);
      expect(input.password).toBe('a');
    });
  });

  describe('redactUrl', () => {
    it('hides OAuth code and state values', () => {
      expect(redactUrl('/api/adwords?code=4/abc&state=xyz&x=1')).toBe('/api/adwords?code=[REDACTED]&state=[REDACTED]&x=1');
      expect(redactUrl(undefined)).toBe('');
    });
  });

  describe('getClientIp', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });
    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('ignores a forwarded header unless a proxy is configured, because a client can send it itself', () => {
      delete process.env.TRUST_PROXY;
      expect(getClientIp(buildRequest({ headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('unknown');
    });

    it('reads the entry one hop from the right when TRUST_PROXY=true', () => {
      process.env.TRUST_PROXY = 'true';
      // the client-supplied first entry is ignored; our proxy appended the last one
      expect(getClientIp(buildRequest({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.5' } }))).toBe('203.0.113.5');
    });

    it('honours a hop count', () => {
      process.env.TRUST_PROXY = '2';
      expect(getClientIp(buildRequest({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.5, 172.16.0.1' } }))).toBe('203.0.113.5');
    });

    it('returns unknown when the entry is missing or not an IP', () => {
      process.env.TRUST_PROXY = '1';
      expect(getClientIp(buildRequest())).toBe('unknown');
      expect(getClientIp(buildRequest({ headers: { 'x-forwarded-for': 'not-an-ip' } }))).toBe('unknown');
      process.env.TRUST_PROXY = '3';
      expect(getClientIp(buildRequest({ headers: { 'x-forwarded-for': '203.0.113.5' } }))).toBe('unknown');
    });
  });
});
