import normalizeOrigin from '../../../utils/normalizeOrigin';
import { ApiError, callApi } from '../../../utils/client/apiClient';
const mockOrigin = 'http://localhost:3000';
jest.mock('../../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

describe('getClientOrigin', () => {
   const getClientOrigin = jest.requireActual<typeof import('../../../utils/client/origin')>(
      '../../../utils/client/origin',
   ).getClientOrigin;

   const withServerEnvironment = (env: { NEXT_PUBLIC_APP_URL?: string; APP_URL?: string }, run: () => void) => {
      const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const originalNextPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
      const originalAppUrl = process.env.APP_URL;
      Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
      if (env.NEXT_PUBLIC_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL;
      if (env.APP_URL === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = env.APP_URL;

      try {
         run();
      } finally {
         if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
         else Reflect.deleteProperty(globalThis, 'window');
         if (originalNextPublicUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
         else process.env.NEXT_PUBLIC_APP_URL = originalNextPublicUrl;
         if (originalAppUrl === undefined) delete process.env.APP_URL;
         else process.env.APP_URL = originalAppUrl;
      }
   };

   it('prefers the public app URL and removes trailing slashes without a browser window', () => {
      withServerEnvironment(
         { NEXT_PUBLIC_APP_URL: 'https://public.example///', APP_URL: 'https://server.example' },
         () => expect(getClientOrigin()).toBe('https://public.example'),
      );
   });

   it.each([
      ['server app URL', { APP_URL: 'https://server.example/' }, 'https://server.example'],
      ['local fallback', {}, 'http://localhost:3000'],
   ] as const)('uses the %s when no browser window or public URL is available', (_label, env, expected) => {
      withServerEnvironment(env, () => expect(getClientOrigin()).toBe(expected));
   });
});

describe('api client', () => {
  describe('ApiError', () => {
     it('constructs with statusCode, code, and optional requestId', () => {
        const err = new ApiError('Not found', 404, 'NOT_FOUND', 'req-1');
        expect(err.message).toBe('Not found');
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('NOT_FOUND');
        expect(err.requestId).toBe('req-1');
        expect(err.name).toBe('ApiError');
     });

     it('requestId is optional', () => {
        const err = new ApiError('Bad request', 400, 'BAD_REQUEST');
        expect(err.requestId).toBeUndefined();
     });
  });

  describe('callApi', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        global.fetch = jest.fn() as unknown as typeof fetch;
     });

     afterEach(() => {
        global.fetch = originalFetch;
     });

     const mockFetch = (status: number, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status,
           ok: status >= 200 && status < 300,
           headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
           json: jest.fn().mockResolvedValue(body),
           text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        });
     };
     const ok = (data: unknown) => ({ data, error: null, requestId: 'rid-ok' });

     it('unwraps `data` from the success envelope', async () => {
        mockFetch(200, ok({ domains: [] }));

        await expect(callApi('domains.list')).resolves.toEqual({ domains: [] });
     });

     it('encodes the query for reads: booleans as text, lists comma-separated, undefined left out, no body or Content-Type', async () => {
        mockFetch(200, ok({ domains: [] }));

        await callApi('domains.list', { query: { withstats: true, domains: ['a.com', 'b.com'] } });

        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(`${mockOrigin}/api/serp/domains?withstats=true&domains=a.com%2Cb.com`);
        expect(init.method).toBe('GET');
        expect(init.body).toBeUndefined();
        expect(init.headers['Content-Type']).toBeUndefined();
     });

     it('sends the method and path of the endpoint with a JSON body for writes', async () => {
        mockFetch(200, ok({ keywordsRemoved: 2 }));

        await callApi('keywords.remove', { body: { ids: [1, 2] } });

        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe(`${mockOrigin}/api/serp/keywords`);
        expect(init).toMatchObject({ method: 'DELETE', body: JSON.stringify({ ids: [1, 2] }), headers: expect.objectContaining({ 'Content-Type': 'application/json' }) });
     });

     it('refuses a request that does not match the endpoint schema, without calling the server', async () => {
        await expect(callApi('keywords.remove', { body: { ids: [] } })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        await expect(callApi('keywords.update', { body: { ids: [1], sticky: true, tags: {} } as never })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
        expect(global.fetch).not.toHaveBeenCalled();
     });

     it('throws ApiError with the message, code and request id of a failure envelope', async () => {
        mockFetch(404, { data: null, error: { code: 'NOT_FOUND', message: 'Domain not found' }, requestId: 'rid-1' });

        await expect(callApi('domains.get', { query: { domain: 'missing.com' } })).rejects.toMatchObject({
           message: 'Domain not found',
           statusCode: 404,
           code: 'NOT_FOUND',
           requestId: 'rid-1',
        });
     });

     it('does not accept the old string error shape: it is an unreadable failure', async () => {
        mockFetch(400, { error: 'Bad request legacy' });

        await expect(callApi('auth.logout', { body: {} })).rejects.toMatchObject({
           message: 'Server error (400): Please try again later',
           statusCode: 400,
           code: 'UNKNOWN',
        });
     });

     it('takes the request id from the X-Request-Id header when the body has none', async () => {
        mockFetch(500, { data: null, error: { code: 'SERVER_ERROR', message: 'Boom' } }, { 'content-type': 'application/json', 'X-Request-Id': 'req-xyz' });

        await expect(callApi('auth.logout', { body: {} })).rejects.toMatchObject({ requestId: 'req-xyz' });
     });

     it('falls back to a generic message for a non-JSON error response', async () => {
        mockFetch(503, '<html>Service Unavailable</html>', { 'content-type': 'text/html' });

        await expect(callApi('auth.logout', { body: {} })).rejects.toMatchObject({ message: 'Server error (503): Please try again later' });
     });

     it('rejects a success that is not an envelope, an empty body, and data that does not match the endpoint', async () => {
        mockFetch(200, { domains: [] });
        await expect(callApi('domains.list')).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });

        mockFetch(204, '', { 'content-type': 'text/plain' });
        await expect(callApi('domains.list')).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });

        mockFetch(200, ok({ domains: 'nope' }));
        await expect(callApi('domains.list')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', requestId: 'rid-ok' });
     });
  });
});

describe('conflictMessage', () => {
  const { ApiError, conflictMessage } = require('../../../utils/client/apiClient');

  it('shows the server message for a 409 and the fallback for anything else', () => {
    expect(conflictMessage(new ApiError('Try again once the refresh has finished.', 409, 'CONFLICT'), 'Error')).toBe('Try again once the refresh has finished.');
    expect(conflictMessage(new ApiError('Server error', 500, 'INTERNAL_SERVER_ERROR'), 'Error removing the keywords')).toBe('Error removing the keywords');
    expect(conflictMessage(new ApiError('   ', 409, 'CONFLICT'), 'Error')).toBe('Error');
    expect(conflictMessage(new Error('network down'), 'Error')).toBe('Error');
  });
});

describe('normalizeOrigin', () => {
    it('removes one or more trailing slashes, keeping any path', () => {
      const cases: Array<[string, string]> = [
        ['https://example.com/', 'https://example.com'],
        ['https://example.com///', 'https://example.com'],
        ['https://example.com/path/', 'https://example.com/path'],
      ];
      for (const [input, expected] of cases) {
        expect(normalizeOrigin(input)).toBe(expected);
      }
    });

    it('leaves a URL with no trailing slash and an empty string unchanged, and returns empty for only slashes', () => {
      expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
      expect(normalizeOrigin('')).toBe('');
      expect(normalizeOrigin('///')).toBe('');
    });
  });
