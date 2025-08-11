import { getAdwordsKeywordIdeas } from '../../utils/adwords';
import Keyword from '../../database/models/keyword';
import { readLocalSCData } from '../../utils/searchConsole';

// Mock dependencies
jest.mock('../../database/models/keyword');
jest.mock('../../utils/searchConsole');
jest.mock('../../utils/parseKeywords', () => ({
  __esModule: true,
  default: (keywords: any[]) => keywords.map(k => ({
    ...k,
    ID: k.ID || 1,
    keyword: k.keyword || 'test keyword',
    domain: k.domain || 'example-com',
    position: k.position || 5,
    url: k.url || 'https://example.com',
    tags: k.tags || '',
    country: k.country || 'US',
    device: k.device || 'desktop',
    added: k.added || '2024-01-01',
    updated: k.updated || '2024-01-01',
  })),
}));

const mockCredentials = {
  client_id: 'test_client_id',
  client_secret: 'test_client_secret',
  developer_token: 'test_developer_token',
  account_id: '123-456-7890',
  refresh_token: 'test_refresh_token',
};

describe('AdWords Keyword Ideas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAdwordsKeywordIdeas - tracking seedType', () => {
    it('should throw an error when no tracked keywords are found', async () => {
      // Mock empty keywords in database
      (Keyword.findAll as jest.Mock).mockResolvedValue([]);

      const adwordsDomainOptions = {
        country: 'US',
        language: '1000',
        keywords: [],
        domainUrl: 'example.com',
        domainSlug: 'example-com',
        seedType: 'tracking' as const,
      };

      await expect(
        getAdwordsKeywordIdeas(mockCredentials, adwordsDomainOptions, true)
      ).rejects.toThrow('No tracked keywords found for this domain. Please add some keywords to track first, or try a different seed type.');
    });

    it('should proceed when tracked keywords are found', async () => {
      // Mock keywords in database
      const mockKeywords = [
        {
          get: () => ({
            ID: 1,
            keyword: 'test keyword',
            domain: 'example-com',
            position: 5,
            url: 'https://example.com',
            tags: '[]',
            country: 'US',
            device: 'desktop',
            added: '2024-01-01',
            updated: '2024-01-01',
            history: '[]',
            lastResult: '{}',
            lastUpdateError: 'false',
          }),
        },
      ];
      (Keyword.findAll as jest.Mock).mockResolvedValue(mockKeywords);

      // Mock successful API response
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'test_token' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        });

      const adwordsDomainOptions = {
        country: 'US',
        language: '1000',
        keywords: [],
        domainUrl: 'example.com',
        domainSlug: 'example-com',
        seedType: 'tracking' as const,
      };

      const result = await getAdwordsKeywordIdeas(mockCredentials, adwordsDomainOptions, true);
      expect(result).toEqual([]);
      expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: 'example-com' } });
    });
  });

  describe('getAdwordsKeywordIdeas - searchconsole seedType', () => {
    it('should throw an error when no search console data is found', async () => {
      // Mock empty search console data
      (readLocalSCData as jest.Mock).mockResolvedValue(null);

      const adwordsDomainOptions = {
        country: 'US',
        language: '1000',
        keywords: [],
        domainUrl: 'example.com',
        domainSlug: 'example-com',
        seedType: 'searchconsole' as const,
      };

      await expect(
        getAdwordsKeywordIdeas(mockCredentials, adwordsDomainOptions, true)
      ).rejects.toThrow('No Search Console data found for this domain. Please ensure Search Console is connected and has data, or try a different seed type.');
    });

    it('should throw an error when search console data exists but has no thirtyDays data', async () => {
      // Mock search console data without thirtyDays
      (readLocalSCData as jest.Mock).mockResolvedValue({ someOtherData: true });

      const adwordsDomainOptions = {
        country: 'US',
        language: '1000',
        keywords: [],
        domainUrl: 'example.com',
        domainSlug: 'example-com',
        seedType: 'searchconsole' as const,
      };

      await expect(
        getAdwordsKeywordIdeas(mockCredentials, adwordsDomainOptions, true)
      ).rejects.toThrow('No Search Console data found for this domain. Please ensure Search Console is connected and has data, or try a different seed type.');
    });

    it('should proceed when search console data is found', async () => {
      // Mock search console data with keywords
      const mockSCData = {
        thirtyDays: [
          { keyword: 'search console keyword', impressions: 100, clicks: 10 },
          { keyword: 'another keyword', impressions: 50, clicks: 5 },
        ],
      };
      (readLocalSCData as jest.Mock).mockResolvedValue(mockSCData);

      // Mock successful API response
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ access_token: 'test_token' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          json: () => Promise.resolve({ results: [] }),
        });

      const adwordsDomainOptions = {
        country: 'US',
        language: '1000',
        keywords: [],
        domainUrl: 'example.com',
        domainSlug: 'example-com',
        seedType: 'searchconsole' as const,
      };

      const result = await getAdwordsKeywordIdeas(mockCredentials, adwordsDomainOptions, true);
      expect(result).toEqual([]);
      expect(readLocalSCData).toHaveBeenCalledWith('example-com');
    });
  });
});