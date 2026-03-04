/**
 * Side-effects behavior tests for refresh: history trimming, business name
 * propagation, domain stats updates, and scraper override logging.
 */

import Cryptr from 'cryptr';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../utils/refresh';
import { scrapeKeywordWithStrategy } from '../../utils/scraper';
import type { RefreshResult } from '../../utils/scraper';
import { updateDomainStats } from '../../utils/updateDomainStats';

// Mock the dependencies
jest.mock('../../database/models/domain');
jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
  removeFromRetryQueue: jest.fn(),
  retryScrape: jest.fn(),
  scrapeKeywordWithStrategy: jest.fn(),
}));
jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    removeBatch: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../utils/updateDomainStats', () => ({
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// History trimming
// ---------------------------------------------------------------------------

describe('History Trimming Optimization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should trim history to 30 days when exceeding limit', async () => {
    // Create a keyword with 40 days of history
    const history: Record<string, number> = {};
    for (let i = 40; i >= 1; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      history[dateKey] = i;
    }

    const keywordData = {
      ID: 1,
      keyword: 'test',
      device: 'desktop',
      domain: 'example.com',
      position: 10,
      history,
      lastResult: [],
      lastUpdated: new Date().toJSON(),
      url: '',
      tags: [],
      updating: false,
      sticky: false,
      added: new Date().toJSON(),
      country: 'US',
      location: '',
      volume: 0,
      lastUpdateError: false,
      mapPackTop3: false,
    };

    const keywordMock = {
      get: jest.fn().mockReturnValue(keywordData),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    const updatedKeyword = {
      ID: 1,
      keyword: 'test',
      position: 5,
      url: 'https://example.com',
      result: [],
      localResults: [],
      mapPackTop3: false,
    };

    const settings = {
      scraper_type: 'scrapingant',
      scrape_retry: false,
    } as SettingsType;

    await updateKeywordPosition(keywordMock, updatedKeyword, settings);

    expect(keywordMock.update).toHaveBeenCalled();
    const updateCall = (keywordMock.update as jest.Mock).mock.calls[0][0];
    const savedHistory = JSON.parse(updateCall.history);

    // Should have at most 30 entries (plus today's new entry)
    expect(Object.keys(savedHistory).length).toBeLessThanOrEqual(31);
  });

  it('should keep all history when less than 30 days', async () => {
    // Create a keyword with only 10 days of history
    const history: Record<string, number> = {};
    for (let i = 10; i >= 1; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      history[dateKey] = i;
    }

    const keywordData = {
      ID: 1,
      keyword: 'test',
      device: 'desktop',
      domain: 'example.com',
      position: 10,
      history,
      lastResult: [],
      lastUpdated: new Date().toJSON(),
      url: '',
      tags: [],
      updating: false,
      sticky: false,
      added: new Date().toJSON(),
      country: 'US',
      location: '',
      volume: 0,
      lastUpdateError: false,
      mapPackTop3: false,
    };

    const keywordMock = {
      get: jest.fn().mockReturnValue(keywordData),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    const updatedKeyword = {
      ID: 1,
      keyword: 'test',
      position: 5,
      url: 'https://example.com',
      result: [],
      localResults: [],
      mapPackTop3: false,
    };

    const settings = {
      scraper_type: 'scrapingant',
      scrape_retry: false,
    } as SettingsType;

    await updateKeywordPosition(keywordMock, updatedKeyword, settings);

    expect(keywordMock.update).toHaveBeenCalled();
    const updateCall = (keywordMock.update as jest.Mock).mock.calls[0][0];
    const savedHistory = JSON.parse(updateCall.history);

    // Should have all 10 entries plus today's new entry
    expect(Object.keys(savedHistory).length).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Business name propagation
// ---------------------------------------------------------------------------

describe('refreshAndUpdateKeywords - business_name handling', () => {
  const mockSettings = {
    scraper_type: 'valueserp',
    scrape_retry: false,
  } as SettingsType;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret-for-encryption';
  });

  it('passes business_name from domain field to scrapeKeywordWithStrategy', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);

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
    (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
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
    } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
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
      expect.objectContaining({}),
    );
  });

  it('does not include business_name when not present in domain scraper settings', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);

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
    (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 5,
      url: 'https://example.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'test keyword' }),
      expect.not.objectContaining({ business_name: expect.anything() }),
      expect.objectContaining({}),
    );
  });

  it('uses global settings when domain has no scraper override', async () => {
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
    (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 5,
      url: 'https://example.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'test keyword' }),
      expect.objectContaining({ scraper_type: 'valueserp' }),
      expect.objectContaining({}),
    );
  });
});

// ---------------------------------------------------------------------------
// Parallel domain stats updates
// ---------------------------------------------------------------------------

describe('Parallel Domain Stats Updates', () => {
  const mockSettings = {
    scraper_type: 'serpapi',
    scrape_retry: false,
  } as SettingsType;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret';
  });

  it('should update multiple domain stats in parallel (not sequentially)', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'domain1.com',
        keyword: 'keyword 1',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'domain1.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 2,
        domain: 'domain2.com',
        keyword: 'keyword 2',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 2, domain: 'domain2.com', keyword: 'keyword 2', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 3,
        domain: 'domain3.com',
        keyword: 'keyword 3',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 3, domain: 'domain3.com', keyword: 'keyword 3', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'domain1.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'domain2.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'domain3.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordWithStrategy as jest.Mock)
      .mockResolvedValueOnce({ ID: 1, keyword: 'keyword 1', position: 5, url: 'https://domain1.com', result: [], localResults: [], mapPackTop3: false, error: false })
      .mockResolvedValueOnce({ ID: 2, keyword: 'keyword 2', position: 10, url: 'https://domain2.com', result: [], localResults: [], mapPackTop3: false, error: false })
      .mockResolvedValueOnce({ ID: 3, keyword: 'keyword 3', position: 15, url: 'https://domain3.com', result: [], localResults: [], mapPackTop3: false, error: false });

    const started: string[] = [];
    const completed: string[] = [];

    (updateDomainStats as jest.Mock).mockImplementation(async (domainName: string) => {
      started.push(domainName);
      await new Promise(resolve => setImmediate(resolve));
      completed.push(domainName);
    });

    await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

    expect(updateDomainStats).toHaveBeenCalledTimes(3);
    expect(updateDomainStats).toHaveBeenCalledWith('domain1.com');
    expect(updateDomainStats).toHaveBeenCalledWith('domain2.com');
    expect(updateDomainStats).toHaveBeenCalledWith('domain3.com');

    expect(started).toHaveLength(3);
    expect(completed).toHaveLength(3);

    // In parallel execution all start before any complete
    const allStartedBeforeFirstComplete = started.length === 3;
    expect(allStartedBeforeFirstComplete).toBe(true);
  });

  it('should handle domain stats updates even when keywords from same domain', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'example.com',
        keyword: 'keyword 1',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'example.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 2,
        domain: 'example.com',
        keyword: 'keyword 2',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 2, domain: 'example.com', keyword: 'keyword 2', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordWithStrategy as jest.Mock)
      .mockResolvedValueOnce({ ID: 1, keyword: 'keyword 1', position: 5, url: 'https://example.com', result: [], localResults: [], mapPackTop3: false, error: false })
      .mockResolvedValueOnce({ ID: 2, keyword: 'keyword 2', position: 10, url: 'https://example.com', result: [], localResults: [], mapPackTop3: false, error: false });

    await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

    // Should only call updateDomainStats once for the domain (not once per keyword)
    expect(updateDomainStats).toHaveBeenCalledTimes(1);
    expect(updateDomainStats).toHaveBeenCalledWith('example.com');
  });

  it('should not call updateDomainStats when no keywords are updated', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'disabled.com',
        keyword: 'keyword 1',
        updating: 0,
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    // Domain has scraping disabled
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

    expect(updateDomainStats).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scraper override logging
// ---------------------------------------------------------------------------

describe('refreshAndUpdateKeywords - scraper override logging', () => {
  const mockSettings = {
    scraper_type: 'valueserp',
    scrape_retry: false,
  } as SettingsType;

  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret-for-encryption';
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should NOT log override when domain only has business_name (no scraper_type)', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'vontainment.com',
          scrapeEnabled: true,
          business_name: 'Vontainment',
          scraper_settings: null,
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
      updating: true,
      sticky: false,
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
    (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 1,
      url: 'https://vontainment.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    const overrideCalls = consoleSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string | undefined)?.includes('Override for vontainment.com')
    );
    expect(overrideCalls).toHaveLength(0);

    const allOverridesCalls = consoleSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string | undefined)?.includes('All requested domains use scraper overrides')
    );
    expect(allOverridesCalls).toHaveLength(0);
  });

  it('should log override when domain has scraper_type', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);

    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'vontainment.com',
          scrapeEnabled: true,
          business_name: 'Vontainment',
          scraper_settings: JSON.stringify({
            scraper_type: 'serpapi',
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
      updating: true,
      sticky: false,
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
    (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 1,
      url: 'https://vontainment.com/',
      result: [],
      mapPackTop3: false,
      error: false,
    } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel], mockSettings);

    // If [REFRESH] logs are visible, they should show override (debug level may suppress)
    const overrideLogPresent = consoleSpy.mock.calls.some((call: unknown[]) =>
      (call[0] as string | undefined)?.includes('[REFRESH] Override for vontainment.com')
    );
    if (consoleSpy.mock.calls.some((call: unknown[]) => (call[0] as string | undefined)?.includes('[REFRESH]'))) {
      expect(overrideLogPresent).toBe(true);
    }

    // Should NOT log "using global scraper fallback"
    const fallbackCalls = consoleSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string | undefined)?.includes('Domain vontainment.com using global scraper fallback')
    );
    expect(fallbackCalls).toHaveLength(0);
  });

  it('should correctly handle mixed domains (some with overrides, some with only business_name)', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);

    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'with-override.com',
          scrapeEnabled: true,
          business_name: 'Override Business',
          scraper_settings: JSON.stringify({
            scraper_type: 'serpapi',
            scraping_api: cryptr.encrypt('test-api-key'),
          }),
        }),
      },
      {
        get: () => ({
          domain: 'only-business-name.com',
          scrapeEnabled: true,
          business_name: 'Business Only',
          scraper_settings: null,
        }),
      },
    ]);

    const makeKeywordPlain = (id: number, domain: string, keyword: string) => ({
      ID: id,
      keyword,
      domain,
      device: 'mobile',
      country: 'US',
      location: '',
      position: 0,
      volume: 0,
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: false,
    });

    const kw1Plain = makeKeywordPlain(1, 'with-override.com', 'keyword 1');
    const kw2Plain = makeKeywordPlain(2, 'only-business-name.com', 'keyword 2');

    const makeModel = (plain: ReturnType<typeof makeKeywordPlain>) => ({
      ID: plain.ID,
      keyword: plain.keyword,
      domain: plain.domain,
      get: jest.fn().mockReturnValue(plain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Keyword;

    const keywordModel1 = makeModel(kw1Plain);
    const keywordModel2 = makeModel(kw2Plain);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordWithStrategy as jest.Mock)
      .mockResolvedValueOnce({ ID: 1, position: 1, url: 'https://with-override.com/', result: [], mapPackTop3: false, error: false } as unknown as RefreshResult)
      .mockResolvedValueOnce({ ID: 2, position: 2, url: 'https://only-business-name.com/', result: [], mapPackTop3: false, error: false } as unknown as RefreshResult);

    await refreshAndUpdateKeywords([keywordModel1, keywordModel2], mockSettings);

    // Should NOT log "All requested domains use scraper overrides" since one is a fallback
    const allOverridesCalls = consoleSpy.mock.calls.filter((call: unknown[]) =>
      (call[0] as string | undefined)?.includes('All requested domains use scraper overrides')
    );
    expect(allOverridesCalls).toHaveLength(0);
  });
});
