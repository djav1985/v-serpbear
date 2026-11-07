export {};
import type { NextRouter } from 'next/router';

const mockOrigin = 'http://localhost:3000';

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { fetchDomain, fetchDomainThumbnails, getDomainThumbnailUrl, regenerateDomainThumbnail } from '../../services/domains';

// ---------------------------------------------------------------------------
// domain thumbnails
// ---------------------------------------------------------------------------

describe('domain thumbnails', () => {
   const originalFetch = global.fetch;

   afterEach(() => {
      global.fetch = originalFetch;
   });

   it('builds the thumbnail address from the domain and the file date', () => {
      expect(getDomainThumbnailUrl('example.com', '2026-11-07')).toBe('/api/thumbnail?domain=example.com&v=2026-11-07');
   });

   it('reads the date of each saved thumbnail from the server', async () => {
      global.fetch = jest.fn().mockResolvedValue({
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue({ thumbnails: { 'example.com': '2026-11-07' } }),
      }) as unknown as typeof fetch;

      await expect(fetchDomainThumbnails()).resolves.toEqual({ 'example.com': '2026-11-07' });
      expect(global.fetch).toHaveBeenCalledWith(`${mockOrigin}/api/thumbnail`, expect.anything());
   });

   it('reports the new date after a regeneration, and false when it fails', async () => {
      global.fetch = jest.fn()
         .mockResolvedValueOnce({
            status: 200,
            headers: { get: jest.fn().mockReturnValue(null) },
            json: jest.fn().mockResolvedValue({ thumbnail: '2026-11-07' }),
         })
         .mockResolvedValueOnce({
            status: 502,
            headers: { get: jest.fn().mockReturnValue(null) },
            json: jest.fn().mockResolvedValue({ error: { code: 'BAD_GATEWAY', message: 'No screenshot' } }),
         }) as unknown as typeof fetch;

      await expect(regenerateDomainThumbnail('example.com')).resolves.toBe('2026-11-07');
      await expect(regenerateDomainThumbnail('example.com')).resolves.toBe(false);
   });
});

// ---------------------------------------------------------------------------
// fetchDomain
// ---------------------------------------------------------------------------

describe('fetchDomain', () => {
   const originalFetch = global.fetch;
   const pushMock = jest.fn();
   const router = { push: pushMock } as unknown as NextRouter;

   beforeEach(() => {
      pushMock.mockClear();
      global.fetch = jest.fn() as unknown as typeof fetch;
   });

   afterEach(() => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockReset();
   });

   afterAll(() => {
      global.fetch = originalFetch;
   });

   const mockSuccessfulFetch = (body: unknown) => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockResolvedValue({
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue(body),
      });
   };

   it('URL-encodes provided domain names before requesting the API', async () => {
      const payload = { domain: { ID: 42 } };
      mockSuccessfulFetch(payload);

      const domainWithPath = 'example.com/path? q';
      const response = await fetchDomain(router, domainWithPath);

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
         `${mockOrigin}/api/domain?domain=${encodeURIComponent(domainWithPath)}`,
         expect.objectContaining({ method: 'GET' }),
      );
      expect(response).toBe(payload);
   });

   it('defers empty domain validation to the API', async () => {
      const payload = { domain: null };
      mockSuccessfulFetch(payload);

      const response = await fetchDomain(router, '');

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
         `${mockOrigin}/api/domain?domain=`,
         expect.objectContaining({ method: 'GET' }),
      );
      expect(response).toBe(payload);
   });

   it('throws a descriptive error when the API returns 404', async () => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockResolvedValueOnce({
         status: 404,
         headers: { get: jest.fn().mockReturnValue('application/json') },
         json: jest.fn().mockResolvedValue({ error: 'Domain not found' }),
      });

      await expect(fetchDomain(router, 'unknown.example.com')).rejects.toThrow('Domain not found');
      expect(pushMock).not.toHaveBeenCalled();
   });
});
