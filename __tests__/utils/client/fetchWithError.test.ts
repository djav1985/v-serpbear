/**
 * These tests verify the error-handling contract of apiFetch (canonical HTTP client).
 * They replaced the former fetchWithError.test.ts when fetchWithError.ts was removed and
 * apiFetch became the single source of truth for fetch error parsing.
 */

const mockOrigin = 'http://localhost:3000';

jest.mock('../../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { apiFetch, ApiError } from '../../../utils/client/apiClient';

const originalFetch = global.fetch;

beforeEach(() => {
   global.fetch = jest.fn() as unknown as typeof fetch;
});

afterEach(() => {
   global.fetch = originalFetch;
   (global.fetch as unknown as jest.Mock)?.mockReset?.();
});

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
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
}

describe('apiFetch error contract (replaces throwOnError / extractErrorMessage tests)', () => {
   it('resolves with parsed JSON on 2xx', async () => {
      mockFetch(200, { ok: true }, { 'content-type': 'application/json' });
      await expect(apiFetch('/api/test')).resolves.toEqual({ ok: true });
   });

   it('throws ApiError with JSON error message on 400', async () => {
      mockFetch(400, { error: { code: 'BAD_REQUEST', message: 'Bad request' } }, { 'content-type': 'application/json' });
      await expect(apiFetch('/api/test')).rejects.toMatchObject({
         message: 'Bad request',
         statusCode: 400,
      });
   });

   it('throws ApiError with fallback message for non-JSON 500', async () => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockResolvedValueOnce({
         status: 500,
         ok: false,
         headers: { get: () => 'text/html' },
         json: jest.fn().mockRejectedValue(new Error('Not JSON')),
         text: jest.fn().mockResolvedValue('<html>error</html>'),
      });
      await expect(apiFetch('/api/test')).rejects.toMatchObject({ statusCode: 500 });
   });

   it('calls router.push("/login") on 401 and throws', async () => {
      mockFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { 'content-type': 'application/json' });
      const router = { push: jest.fn() };
      await expect(apiFetch('/api/test', {}, router)).rejects.toThrow('Unauthorized');
      expect(router.push).toHaveBeenCalledWith('/login');
   });

   it('does not call router.push for non-401 errors', async () => {
      mockFetch(403, { error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { 'content-type': 'application/json' });
      const router = { push: jest.fn() };
      await expect(apiFetch('/api/test', {}, router)).rejects.toThrow('Forbidden');
      expect(router.push).not.toHaveBeenCalled();
   });

   it('throws ApiError (instance of Error) on 401 without router', async () => {
      mockFetch(401, { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { 'content-type': 'application/json' });
      const err = await apiFetch('/api/test').catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Unauthorized');
      expect((err as ApiError).statusCode).toBe(401);
   });
});
