import Cryptr from 'cryptr';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import type { RefreshResult } from '../../utils/scraper';

// Mock the dependencies
jest.mock('../../database/models/domain');
jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
  removeFromRetryQueue: jest.fn(),
  retryScrape: jest.fn(),
  scrapeKeywordFromGoogle: jest.fn(),
}));

describe('refreshAndUpdateKeywords - business_name handling', () => {
  const mockSettings = {
    scraper_type: 'valueserp',
    scrape_retry: false,
  } as SettingsType;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret-for-encryption';
  });

  it('passes business_name from domain field to scrapeKeywordFromGoogle', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    
    // Setup: domain has business_name as a separate field
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'vontainment.com',
          scrapeEnabled: 1,
          business_name: 'Vontainment',
          scraper_settings: JSON.stringify({
            scraper_type: 'valueserp',
            scraping_api: cryptr.encrypt('test-api-key'),
          }),
        }),
      },
    ]);

    const keywordPlain = {
      ID: 3493,
      keyword: 'port charlotte affordable website design',
      domain: 'vontainment.com',
      device: 'mobile',
      country: 'US',
      location: '',
      position: 0,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: false,
    };

    const keywordModel = {
      ID: keywordPlain.ID,
      keyword: keywordPlain.keyword,
      domain: keywordPlain.domain,
      get: jest.fn().mockReturnValue(keywordPlain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    
    // Mock scraper response with local results containing business name
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 1,
      url: 'https://vontainment.com/',
      result: [],
      localResults: [
        { position: 1, title: 'Other Business', website: 'https://other.com' },
        { position: 2, title: 'Vontainment', website: 'https://google.com/maps/place/vontainment' },
        { position: 3, title: 'Another Business', website: 'https://another.com' },
      ],
      mapPackTop3: true,
      error: false,
    } as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    // Verify scrapeKeywordFromGoogle was called with effective settings including business_name
    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ 
        keyword: 'port charlotte affordable website design',
        domain: 'vontainment.com',
        device: 'mobile',
      }),
      expect.objectContaining({ 
        scraper_type: 'valueserp',
        scraping_api: 'test-api-key',
        business_name: 'Vontainment',
      }),
    );
  });

  it('does not include business_name when not present in domain scraper settings', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    
    // Setup: domain scraper settings without business_name
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'valueserp',
            scraping_api: cryptr.encrypt('test-api-key'),
          }),
        }),
      },
    ]);

    const keywordPlain = {
      ID: 100,
      keyword: 'test keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 0,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: false,
    };

    const keywordModel = {
      ID: keywordPlain.ID,
      keyword: keywordPlain.keyword,
      domain: keywordPlain.domain,
      get: jest.fn().mockReturnValue(keywordPlain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 5,
      url: 'https://example.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    // Verify scrapeKeywordFromGoogle was called WITHOUT business_name
    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'test keyword' }),
      expect.not.objectContaining({ business_name: expect.anything() }),
    );
  });

  it('uses global settings when domain has no scraper override', async () => {
    // Setup: domain without scraper_settings
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
          scraper_settings: null,
        }),
      },
    ]);

    const keywordPlain = {
      ID: 101,
      keyword: 'test keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 0,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: false,
    };

    const keywordModel = {
      ID: keywordPlain.ID,
      keyword: keywordPlain.keyword,
      domain: keywordPlain.domain,
      get: jest.fn().mockReturnValue(keywordPlain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 5,
      url: 'https://example.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    // Verify scrapeKeywordFromGoogle was called with global settings (no domain override)
    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'test keyword' }),
      expect.objectContaining({ scraper_type: 'valueserp' }),
    );
  });
});
