import { fetchKeywords } from '../../app/services/keywords';

describe('fetchKeywords normalisation', () => {
   const originalFetch = global.fetch;
   const originalLocation = window.location;

   const mockOrigin = 'http://localhost:3000';
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

   it('coerces string and numeric flags into booleans', async () => {
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
         sticky: '0',
         history: { '2024-01-01': 12 },
         lastResult: [],
         url: '',
         tags: [],
         updating: 'false',
         lastUpdateError: false,
         mapPackTop3: 'yes',
      } as unknown as KeywordType;

      fetchMock.mockResolvedValue({
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
   });

   it('returns consistent object structure when domain is falsy', async () => {
      const response = await fetchKeywords({} as any, '');
      
      expect(response).toBeTruthy();
      expect(typeof response).toBe('object');
      expect(response.keywords).toBeDefined();
      expect(Array.isArray(response.keywords)).toBe(true);
      expect(response.keywords.length).toBe(0);
   });
});
