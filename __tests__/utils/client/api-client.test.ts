import normalizeOrigin from '../../../utils/normalizeOrigin';
import { ApiError, apiFetch, apiPost, apiPut } from '../../../utils/client/apiClient';
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

  describe('apiFetch', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        global.fetch = jest.fn() as unknown as typeof fetch;
     });

     afterEach(() => {
        global.fetch = originalFetch;
     });

     const mockFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status,
           ok: status >= 200 && status < 300,
           headers: {
              get: (name: string) => headers[name] ?? null,
           },
           json: jest.fn().mockResolvedValue(body),
           text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        });
     };

     it('returns parsed JSON body on successful response', async () => {
        mockFetch(200, { domains: [] }, { 'content-type': 'application/json' });
        const result = await apiFetch('/api/serp/domains');
        expect(result).toEqual({ domains: [] });
     });

     it('throws ApiError with structured message on failure envelope', async () => {
        mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Domain not found' }, requestId: 'rid-1' }, { 'content-type': 'application/json' });

        await expect(apiFetch('/api/serp/domain?domain=missing')).rejects.toMatchObject({
           message: 'Domain not found',
           statusCode: 404,
           code: 'NOT_FOUND',
        });
     });

     it('throws ApiError with legacy string error on old-format responses', async () => {
        mockFetch(400, { error: 'Bad request legacy' }, { 'content-type': 'application/json' });

        await expect(apiFetch('/api/something')).rejects.toMatchObject({
           message: 'Bad request legacy',
           statusCode: 400,
        });
     });

     it('propagates X-Request-Id from response headers into ApiError', async () => {
        mockFetch(500, { error: { code: 'SERVER_ERROR', message: 'Boom' } }, { 'content-type': 'application/json', 'X-Request-Id': 'req-xyz' });

         await expect(apiFetch('/api/fail')).rejects.toMatchObject({ requestId: 'req-xyz' });
     });

     it('falls back to generic message for non-JSON error response', async () => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status: 503,
           ok: false,
           headers: { get: () => 'text/html' },
           json: jest.fn().mockRejectedValue(new Error('not json')),
           text: jest.fn().mockResolvedValue('<html>Service Unavailable</html>'),
        });

        await expect(apiFetch('/api/fail')).rejects.toMatchObject({
           message: 'Server error (503): Please try again later',
        });
     });
  });

  describe('HTTP verb helpers', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        global.fetch = jest.fn() as unknown as typeof fetch;
     });

     afterEach(() => {
        global.fetch = originalFetch;
     });

     const mockSuccess = (body: unknown) => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status: 200,
           ok: true,
           headers: { get: () => null },
           json: jest.fn().mockResolvedValue(body),
        });
     };


     it('apiPost calls fetch with POST method and serialized body', async () => {
        mockSuccess({ ok: true });
        await apiPost('/api/test', { key: 'value' });
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({
           method: 'POST',
           body: JSON.stringify({ key: 'value' }),
        }));
     });

     it('apiPut calls fetch with PUT method and serialized body', async () => {
        mockSuccess({ ok: true });
        await apiPut('/api/test', { update: true });
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({
           method: 'PUT',
           body: JSON.stringify({ update: true }),
        }));
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
