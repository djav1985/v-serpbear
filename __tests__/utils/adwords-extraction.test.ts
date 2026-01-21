import * as adwordsUtils from '../../utils/adwords';

jest.mock('../../utils/adwords', () => ({
   ...jest.requireActual('../../utils/adwords'),
   getAdwordsCredentials: jest.fn(),
   getAdwordsAccessToken: jest.fn(),
}));

describe('extractAdwordskeywordIdeas - avgMonthlySearches handling', () => {
   const creds = {
      client_id: 'test-client-id',
      client_secret: 'test-secret',
      developer_token: 'test-dev-token',
      account_id: '123-456-7890',
      refresh_token: 'test-refresh',
   } as any;

   const originalFetch = global.fetch;

   beforeEach(() => {
      jest.resetAllMocks();
   });

   afterEach(() => {
      global.fetch = originalFetch;
      jest.restoreAllMocks();
   });

   it('processes keywords when avgMonthlySearches is provided as a string in API response', async () => {
      // Mock the token request
      const mockFetch = jest.fn()
         .mockResolvedValueOnce({
            json: async () => ({ access_token: 'test-token' }),
            text: async () => JSON.stringify({ access_token: 'test-token' }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         })
         // Mock the keyword ideas request
         .mockResolvedValueOnce({
            json: async () => ({
               results: [
                  {
                     text: 'high volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '5000',
                        competition: 'HIGH',
                        competitionIndex: '80',
                        monthlySearchVolumes: [
                           { month: 'JANUARY', year: '2024', monthlySearches: '5100' },
                           { month: 'DECEMBER', year: '2023', monthlySearches: '4900' },
                        ],
                     },
                  },
               ],
            }),
            text: async () => JSON.stringify({
               results: [
                  {
                     text: 'high volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '5000',
                        competition: 'HIGH',
                        competitionIndex: '80',
                        monthlySearchVolumes: [
                           { month: 'JANUARY', year: '2024', monthlySearches: '5100' },
                           { month: 'DECEMBER', year: '2023', monthlySearches: '4900' },
                        ],
                     },
                  },
               ],
            }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         });

      global.fetch = mockFetch;

      const result = await adwordsUtils.getAdwordsKeywordIdeas(
         creds,
         { country: 'US', language: '1000', keywords: ['test'], domainSlug: 'test.com', seedType: 'custom' },
         true,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].keyword).toBe('high volume keyword');
      expect(result[0].avgMonthlySearches).toBe(5000);
   });

   it('processes keywords when avgMonthlySearches is null but has default value', async () => {
      // This tests the bug fix: Previously, if avgMonthlySearches was null/undefined in the API response,
      // the check `if (keywordIdeaMetrics?.avgMonthlySearches)` would fail even though we set a default value
      const mockFetch = jest.fn()
         .mockResolvedValueOnce({
            json: async () => ({ access_token: 'test-token' }),
            text: async () => JSON.stringify({ access_token: 'test-token' }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         })
         .mockResolvedValueOnce({
            json: async () => ({
               results: [
                  {
                     text: 'keyword without explicit volume',
                     keywordIdeaMetrics: {
                        // avgMonthlySearches is intentionally omitted/null
                        competition: 'MEDIUM',
                        competitionIndex: '50',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            text: async () => JSON.stringify({
               results: [
                  {
                     text: 'keyword without explicit volume',
                     keywordIdeaMetrics: {
                        competition: 'MEDIUM',
                        competitionIndex: '50',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         });

      global.fetch = mockFetch;

      const result = await adwordsUtils.getAdwordsKeywordIdeas(
         creds,
         { country: 'US', language: '1000', keywords: ['test'], domainSlug: 'test.com', seedType: 'custom' },
         true,
      );

      // With the bug fix, this should now process the keyword even if avgMonthlySearches is not explicitly provided
      // The default value '0' will be used, parsed to 0, and will be included (>= 0 check)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // The keyword will now be included because searchVolume (0) >= 0
      expect(result.length).toBe(1);
      expect(result[0].keyword).toBe('keyword without explicit volume');
      expect(result[0].avgMonthlySearches).toBe(0);
   });

   it('includes keywords with all search volumes (including low volume)', async () => {
      const mockFetch = jest.fn()
         .mockResolvedValueOnce({
            json: async () => ({ access_token: 'test-token' }),
            text: async () => JSON.stringify({ access_token: 'test-token' }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         })
         .mockResolvedValueOnce({
            json: async () => ({
               results: [
                  {
                     text: 'low volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '5',
                        competition: 'LOW',
                        competitionIndex: '20',
                        monthlySearchVolumes: [],
                     },
                  },
                  {
                     text: 'medium volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '50',
                        competition: 'MEDIUM',
                        competitionIndex: '50',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            text: async () => JSON.stringify({
               results: [
                  {
                     text: 'low volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '5',
                        competition: 'LOW',
                        competitionIndex: '20',
                        monthlySearchVolumes: [],
                     },
                  },
                  {
                     text: 'medium volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '50',
                        competition: 'MEDIUM',
                        competitionIndex: '50',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         });

      global.fetch = mockFetch;

      const result = await adwordsUtils.getAdwordsKeywordIdeas(
         creds,
         { country: 'US', language: '1000', keywords: ['test'], domainSlug: 'test.com', seedType: 'custom' },
         true,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Both keywords should be included (volume >= 0), sorted by volume descending
      expect(result.length).toBe(2);
      expect(result[0].keyword).toBe('medium volume keyword');
      expect(result[0].avgMonthlySearches).toBe(50);
      expect(result[1].keyword).toBe('low volume keyword');
      expect(result[1].avgMonthlySearches).toBe(5);
   });

   it('processes keywords even when avgMonthlySearches is "0" string', async () => {
      // This is the exact bug: when avgMonthlySearches is "0", the old code would skip processing
      const mockFetch = jest.fn()
         .mockResolvedValueOnce({
            json: async () => ({ access_token: 'test-token' }),
            text: async () => JSON.stringify({ access_token: 'test-token' }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         })
         .mockResolvedValueOnce({
            json: async () => ({
               results: [
                  {
                     text: 'zero volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '0',
                        competition: 'LOW',
                        competitionIndex: '10',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            text: async () => JSON.stringify({
               results: [
                  {
                     text: 'zero volume keyword',
                     keywordIdeaMetrics: {
                        avgMonthlySearches: '0',
                        competition: 'LOW',
                        competitionIndex: '10',
                        monthlySearchVolumes: [],
                     },
                  },
               ],
            }),
            status: 200,
            headers: { get: jest.fn().mockReturnValue('application/json') },
         });

      global.fetch = mockFetch;

      const result = await adwordsUtils.getAdwordsKeywordIdeas(
         creds,
         { country: 'US', language: '1000', keywords: ['test'], domainSlug: 'test.com', seedType: 'custom' },
         true,
      );

      // With the fix, this should process and include the keyword (volume 0 >= 0)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].keyword).toBe('zero volume keyword');
      expect(result[0].avgMonthlySearches).toBe(0);
   });
});
