import type { NextRouter } from 'next/router';

const mockOrigin = 'http://localhost:3000';

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { fetchDomain } from '../../services/domains';

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
