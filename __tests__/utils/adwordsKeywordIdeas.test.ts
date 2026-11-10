import Keyword from '../../database/models/keyword';
import * as scUtils from '../../utils/searchConsole';
import * as adwordsUtils from '../../utils/adwords';

jest.mock('../../utils/searchConsole', () => ({
  readLocalSCData: jest.fn(),
}));

// Mock the getAdwordsCredentials function
jest.mock('../../utils/adwords', () => ({
  ...jest.requireActual('../../utils/adwords'),
  getAdwordsCredentials: jest.fn(),
  getAdwordsAccessToken: jest.fn(),
}));

describe('getAdwordsKeywordIdeas', () => {
  const creds = {
    client_id: '',
    client_secret: '',
    developer_token: '',
    account_id: '123-456-7890',
    refresh_token: '',
  } as any;

  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ access_token: 'test-token' }),
      text: async () => 'non-json response',
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
    }) as any;
    jest.spyOn(Keyword, 'findAll').mockResolvedValue([] as any);
    jest.spyOn(scUtils, 'readLocalSCData').mockResolvedValue(null as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails in test mode for an invalid account ID or a country with no geo target instead of reporting success', async () => {
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        { ...creds, account_id: 'not-an-id' },
        { country: 'US', language: '1000', keywords: ['compress'], seedType: 'custom' },
        true,
      ),
    ).rejects.toThrow(/account ID/);

    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        { ...creds, account_id: '1234567890' },
        { country: 'XX', language: '1000', keywords: ['compress'], seedType: 'custom' },
        true,
      ),
    ).rejects.toThrow(/geo target/);
  });

  it('throws error when no tracked keywords found', async () => {
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        creds,
        { country: 'US', language: '1000', domain: 'example.com', seedType: 'tracking' },
        true,
      ),
    ).rejects.toThrow('No tracked keywords found for this domain');
  });

  it('throws error when no search console keywords found', async () => {
    (scUtils.readLocalSCData as jest.Mock).mockResolvedValue({ thirtyDays: [] });
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        creds,
        { country: 'US', language: '1000', domain: 'example.com', seedType: 'searchconsole' },
        true,
      ),
    ).rejects.toThrow('No search console keywords found for this domain');
  });

  it('sends correct payload format to Google Ads API', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      json: async () => ({ results: [] }),
      text: async () => JSON.stringify({ results: [] }),
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
    });
    
    // Mock the token request
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ access_token: 'test-token' }),
      text: async () => 'token response',
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
    });

    global.fetch = mockFetch;

    await adwordsUtils.getAdwordsKeywordIdeas(
      creds,
      { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
      true,
    );

    // Check that the second call (to Google Ads API) has the correct payload format
    const googleAdsCall = mockFetch.mock.calls[1];
    expect(googleAdsCall[0]).toBe(
      `https://googleads.googleapis.com/${adwordsUtils.GOOGLE_ADS_API_VERSION}/customers/1234567890:generateKeywordIdeas`,
    );
    expect(googleAdsCall[1].body).toBeDefined();
    const payload = JSON.parse(googleAdsCall[1].body);
    
    // Verify geoTargetConstants is sent as an array
    expect(payload.geoTargetConstants).toEqual(['geoTargetConstants/2840']);
    // Verify pageSize is sent as a number
    expect(payload.pageSize).toBe(1);
    expect(typeof payload.pageSize).toBe('number');
  });

  it('handles non-JSON response from Google Ads API', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'test-token' }),
        text: async () => 'token response',
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
      })
      .mockResolvedValueOnce({
        json: async () => { throw new Error('Invalid JSON'); },
        text: async () => '<!DOCTYPE html><html><body>Error page</body></html>',
        status: 500,
        headers: {
          get: jest.fn().mockReturnValue('text/html'),
        },
      });

    global.fetch = mockFetch;

    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        creds,
        { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
        true,
      ),
    ).rejects.toThrow('Google Ads API error (500): Server returned non-JSON response');
  });
});

describe('getKeywordsVolume', () => {
  const originalFetch = global.fetch;
  const mockedGetAdwordsCredentials = adwordsUtils.getAdwordsCredentials as jest.MockedFunction<typeof adwordsUtils.getAdwordsCredentials>;
  const mockedGetAdwordsAccessToken = adwordsUtils.getAdwordsAccessToken as jest.MockedFunction<typeof adwordsUtils.getAdwordsAccessToken>;

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = originalFetch;
    // Ensure the mocks are reset and ready to use
    mockedGetAdwordsCredentials.mockReset();
    mockedGetAdwordsAccessToken.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('handles missing credentials gracefully and pins the v23 generateKeywordHistoricalMetrics URL format', async () => {
    // Missing credentials must not crash with a JSON parse error
    const keywords = [{ ID: 1, keyword: 'test keyword', country: 'US' }] as any;
    const result = await adwordsUtils.getKeywordsVolume(keywords);
    expect(result.volumes).toBe(false);
    expect(result.error).toMatch(/Cannot Load Google Ads Credentials|Google Ads Not Integrated Properly/);

    // Both volume and ideas endpoints share the same API version and URL pattern
    expect(adwordsUtils.GOOGLE_ADS_API_VERSION).toBe('v23');
    const customerId = '123-456-7890'.replace(/-/g, '');
    const baseUrl = `https://googleads.googleapis.com/${adwordsUtils.GOOGLE_ADS_API_VERSION}/customers/${customerId}`;
    expect(`${baseUrl}:generateKeywordHistoricalMetrics`).toBe(
      'https://googleads.googleapis.com/v23/customers/1234567890:generateKeywordHistoricalMetrics',
    );
    expect(`${baseUrl}:generateKeywordIdeas`).toBe(
      'https://googleads.googleapis.com/v23/customers/1234567890:generateKeywordIdeas',
    );
  });
});

describe('updateKeywordsVolumeData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const targets = [{ ID: 1, keyword: 'alpha', country: 'US' }, { ID: 2, keyword: 'beta', country: 'GB' }];

  it('reports only volumes saved for a matching keyword and country', async () => {
    const updateSpy = jest.spyOn(Keyword, 'update')
      .mockResolvedValueOnce([0])
      .mockResolvedValueOnce([1]);

    await expect(adwordsUtils.updateKeywordsVolumeData({ 1: 100, 2: 200 }, targets)).resolves.toEqual({ 2: 200 });

    expect(updateSpy).toHaveBeenNthCalledWith(1, { volume: 100 }, { where: targets[0] });
    expect(updateSpy).toHaveBeenNthCalledWith(2, { volume: 200 }, { where: targets[1] });
  });

  it('skips targets without a volume and propagates database errors', async () => {
    const updateSpy = jest.spyOn(Keyword, 'update').mockRejectedValue(new Error('db failure'));

    await expect(adwordsUtils.updateKeywordsVolumeData({}, targets)).resolves.toEqual({});
    expect(updateSpy).not.toHaveBeenCalled();
    await expect(adwordsUtils.updateKeywordsVolumeData({ 1: 500 }, targets)).rejects.toThrow('db failure');
  });
});

describe('saving fetched keyword ideas', () => {
  const creds = { client_id: 'a', client_secret: 'b', developer_token: 'c', account_id: '123-456-7890', refresh_token: 'e' } as any;
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails instead of reporting success when the ideas could not be stored for the domain', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: async () => ({ access_token: 'token', results: [{ text: 'shoes', keywordIdeaMetrics: { avgMonthlySearches: 500, competition: 'LOW', competitionIndex: 10, monthlySearchVolumes: [] } }] }),
      text: async () => JSON.stringify({ access_token: 'token', results: [{ text: 'shoes', keywordIdeaMetrics: { avgMonthlySearches: 500, competition: 'LOW', competitionIndex: 10, monthlySearchVolumes: [] } }] }),
    }) as any;

    // a domain with characters outside the safe set is refused by the writer, which returns false
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(creds, { country: 'US', language: '1000', keywords: ['shoes'], domain: 'bad/slug', seedType: 'custom' } as any),
    ).rejects.toThrow('could not be saved');
  });
});

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
         { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
         true,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error('Expected array');
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
         { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
         true,
      );

      // With the bug fix, this should now process the keyword even if avgMonthlySearches is not explicitly provided
      // The default value '0' will be used, parsed to 0, and will be included (>= 0 check)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error('Expected array');
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
         { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
         true,
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error('Expected array');
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
         { country: 'US', language: '1000', keywords: ['test'], seedType: 'custom' },
         true,
      );

      // With the fix, this should process and include the keyword (volume 0 >= 0)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error('Expected array');
      expect(result.length).toBe(1);
      expect(result[0].keyword).toBe('zero volume keyword');
      expect(result[0].avgMonthlySearches).toBe(0);
   });
});

describe('Adwords Seed Functions', () => {
  const mockKeywords = [
    { 
      get: () => ({ 
        ID: 1, 
        keyword: 'low volume keyword', 
        volume: 50, 
        domain: 'example.com' 
      }) 
    },
    { 
      get: () => ({ 
        ID: 2, 
        keyword: 'high volume keyword', 
        volume: 1000, 
        domain: 'example.com' 
      }) 
    },
    { 
      get: () => ({ 
        ID: 3, 
        keyword: 'medium volume keyword', 
        volume: 300, 
        domain: 'example.com' 
      }) 
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('seedKeywordsFromTracking improvements', () => {
    // Import the function after mocks are set up
    const getFunction = async () => {
      const adwordsModule = await import('../../utils/adwords');
      // Access the function through the module's internal structure
      // Since it's not exported, we'll test it through integration
      return adwordsModule.getAdwordsKeywordIdeas;
    };

    it('should order keywords by volume descending when using tracking seed type', async () => {
      // Mock Keyword.findAll to return unordered keywords
      const mockFindAll = jest.spyOn(Keyword, 'findAll').mockResolvedValue(mockKeywords as any);
      
      const adwordsFunction = await getFunction();
      
      // Mock the credentials and other dependencies
      const mockCredentials = {
        client_id: 'test',
        client_secret: 'test',
        developer_token: 'test',
        account_id: '123-456-7890',
        refresh_token: 'test',
      };

      // Mock fetch to return access token and then empty results
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'test-token' }),
          text: async () => JSON.stringify({ access_token: 'test-token' }),
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
        })
        .mockResolvedValueOnce({
          json: async () => ({ results: [] }),
          text: async () => JSON.stringify({ results: [] }),
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
        });

      await expect(adwordsFunction(
          mockCredentials,
          { 
            country: 'US', 
            language: '1000', 
            domain: 'example.com',
            seedType: 'tracking'
          },
          true,
        )).resolves.toEqual([]);

      // Verify that findAll was called with ORDER BY volume DESC
      expect(mockFindAll).toHaveBeenCalledWith({
        where: { domain: 'example.com' },
        order: [['volume', 'DESC']],
      });
    });

  });
});
