const mockOrigin = 'http://localhost:3000';

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { fetchKeywords } from '../../services/keywords';

describe('fetchKeywords normalisation', () => {
   const originalFetch = global.fetch;
   const originalLocation = window.location;

   const fetchMock = jest.fn();

   beforeAll(() => {
      Object.defineProperty(window, 'location', {
         value: { origin: mockOrigin },
         writable: true,
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;
   });

   afterAll(() => {
      Object.defineProperty(window, 'location', {
         value: originalLocation,
         writable: true,
      });
      global.fetch = originalFetch;
   });

   beforeEach(() => {
      fetchMock.mockReset();
   });

   it('coerces numeric flags into boolean values', async () => {
      const keywordPayload = {
         ID: 1,
         keyword: 'normalise flags',
         device: 'desktop',
         country: 'US',
         domain: 'example.com',
         lastUpdated: '2024-01-01T00:00:00.000Z',
         added: '2024-01-01T00:00:00.000Z',
         position: 12,
         volume: 50,
         sticky: 0,
         history: { '2024-01-01': 12 },
         lastResult: [],
         url: '',
         tags: [],
         updating: 0,
         lastUpdateError: false,
         mapPackTop3: 1,
      } as unknown as KeywordType;

      fetchMock.mockResolvedValue({
         status: 200,
         json: jest.fn().mockResolvedValue({ keywords: [keywordPayload] }),
      });

      const response = await fetchKeywords({} as any, 'example.com');

      expect(fetchMock).toHaveBeenCalledWith(
         `${mockOrigin}/api/keywords?domain=example.com`,
         { method: 'GET' },
      );

      expect(response).toBeTruthy();
      expect(Array.isArray(response.keywords)).toBe(true);

      const [keyword] = response.keywords as KeywordType[];
      expect(keyword.updating).toBe(false);
      expect(typeof keyword.updating).toBe('boolean');
      expect(keyword.sticky).toBe(false);
      expect(keyword.mapPackTop3).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(keyword, 'mapPackTop3')).toBe(true);
   });

   it('returns consistent object structure when domain is falsy', async () => {
      const response = await fetchKeywords({} as any, '');

      expect(response).toBeTruthy();
      expect(typeof response).toBe('object');
      expect(response.keywords).toBeDefined();
      expect(Array.isArray(response.keywords)).toBe(true);
      expect(response.keywords.length).toBe(0);
   });

   it('redirects to login and throws when the API responds with 401', async () => {
      const pushMock = jest.fn();
      const headers = { get: jest.fn().mockReturnValue('application/json') };
      fetchMock.mockResolvedValueOnce({
         status: 401,
         headers,
         json: jest.fn().mockResolvedValue({ error: 'Unauthorized' }),
      });

      await expect(fetchKeywords({ push: pushMock } as any, 'example.com')).rejects.toThrow('Unauthorized');
      expect(pushMock).toHaveBeenCalledWith('/login');
   });

   it('throws descriptive errors for non-JSON error responses', async () => {
      const textMock = jest.fn().mockResolvedValue('<html></html>');
      fetchMock.mockResolvedValueOnce({
         status: 500,
         headers: { get: jest.fn().mockReturnValue('text/html') },
         json: jest.fn(),
         text: textMock,
      });

      await expect(fetchKeywords({ push: jest.fn() } as any, 'example.com')).rejects.toThrow('Server error (500): Please try again later');
      expect(textMock).toHaveBeenCalled();
   });
});
