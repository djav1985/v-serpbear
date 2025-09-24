import type { NextRouter } from 'next/router';
import { fetchDomain } from '../../app/services/domains';

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
         `${window.location.origin}/api/domain?domain=${encodeURIComponent(domainWithPath)}`,
         { method: 'GET' },
      );
      expect(response).toBe(payload);
   });

   it('defers empty domain validation to the API', async () => {
      const payload = { domain: null };
      mockSuccessfulFetch(payload);

      const response = await fetchDomain(router, '');

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
         `${window.location.origin}/api/domain?domain=`,
         { method: 'GET' },
      );
      expect(response).toBe(payload);
   });
});
