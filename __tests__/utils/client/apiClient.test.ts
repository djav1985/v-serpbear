const mockOrigin = 'http://localhost:3000';

jest.mock('../../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { apiFetch, apiGet, apiPost, apiPut, apiDelete, ApiError } from '../../../utils/client/apiClient';

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
      (global.fetch as unknown as jest.Mock)?.mockReset?.();
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
      const result = await apiFetch('/api/domains');
      expect(result).toEqual({ domains: [] });
   });

   it('throws ApiError with structured message on failure envelope', async () => {
      mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Domain not found' }, requestId: 'rid-1' }, { 'content-type': 'application/json' });

      await expect(apiFetch('/api/domain?domain=missing')).rejects.toMatchObject({
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

      let caughtError: ApiError | undefined;
      try {
         await apiFetch('/api/fail');
      } catch (e) {
         caughtError = e as ApiError;
      }
      expect(caughtError?.requestId).toBe('req-xyz');
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
      (global.fetch as unknown as jest.Mock)?.mockReset?.();
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

   it('apiGet calls fetch with GET method', async () => {
      mockSuccess({ ok: true });
      await apiGet('/api/test');
      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({ method: 'GET' }));
   });

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

   it('apiDelete calls fetch with DELETE method', async () => {
      mockSuccess({ ok: true });
      await apiDelete('/api/test');
      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({ method: 'DELETE' }));
   });
});
