import Cryptr from 'cryptr';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../utils/refresh';
import { removeFromRetryQueue, retryScrape, scrapeKeywordFromGoogle } from '../../utils/scraper';
import type { RefreshResult } from '../../utils/scraper';

// Mock the dependencies
jest.mock('../../database/models/domain');
jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
  removeFromRetryQueue: jest.fn(),
  retryScrape: jest.fn(),
  scrapeKeywordFromGoogle: jest.fn(),
}));

// Mock retryQueueManager
jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    removeBatch: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn().mockResolvedValue([]),
  },
}));

describe('refreshAndUpdateKeywords', () => {
  const mockSettings = {
    scraper_type: 'serpapi',
    scrape_retry: true,
  } as SettingsType;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret';
  });

  it('forces updating reset when scrape fails before updateKeywordPosition', async () => {
    const mockKeywordModel = {
      ID: 101,
      domain: 'example.com',
      keyword: 'example keyword',
      updating: 0,
      get: jest.fn().mockReturnValue({
        ID: 101,
        domain: 'example.com',
        keyword: 'example keyword',
      }),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValue(new Error('network boom'));

    const mockSettings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
    } as SettingsType;

    await refreshAndUpdateKeywords([mockKeywordModel as unknown as Keyword], mockSettings);

    expect(mockKeywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    // We no longer call set() - Sequelize update handles model state
  });

  it('queues retries when sequential scraping returns false', async () => {
    const keywordPlain = {
      ID: 41,
      keyword: 'retry-me',
      domain: 'example.com',
    };

    const keywordModel = {
      ...keywordPlain,
      get: jest.fn().mockReturnValue(keywordPlain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce(false);

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: true,
    } as SettingsType;

    await refreshAndUpdateKeywords([keywordModel], settings);

    // We no longer call set() - Sequelize update handles model state
    expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(retryScrape).toHaveBeenCalledWith(41);
    expect(removeFromRetryQueue).not.toHaveBeenCalled();
  });

  it('removes keywords from retry queue when sequential scraping is disabled', async () => {
    const keywordPlain = {
      ID: 42,
      keyword: 'no-retry',
      domain: 'example.com',
    };

    const keywordModel = {
      ...keywordPlain,
      get: jest.fn().mockReturnValue(keywordPlain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce(false);

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
    } as SettingsType;

    await refreshAndUpdateKeywords([keywordModel], settings);

    // We no longer call set() - Sequelize update handles model state
    expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(removeFromRetryQueue).toHaveBeenCalledWith(42);
    expect(retryScrape).not.toHaveBeenCalled();
  });

  it('applies per-domain scraper overrides when scraping keywords', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'override.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'scrapingant',
            scraping_api: cryptr.encrypt('domain-key'),
          }),
        }),
      },
    ]);

    const keywordPlain = {
      ID: 77,
      keyword: 'override keyword',
      domain: 'override.com',
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

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce({
      ID: keywordPlain.ID,
      position: 3,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult);

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
    } as SettingsType;

    await refreshAndUpdateKeywords([keywordModel], settings);

    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'override keyword' }),
      expect.objectContaining({ scraper_type: 'scrapingant', scraping_api: 'domain-key' }),
    );
  });

  it('clears updating state when parallel scraping rejects for a keyword', async () => {
    const keywordPlain = {
      ID: 55,
      keyword: 'parallel failure',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 4,
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
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValueOnce(new Error('parallel boom'));

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    const results = await refreshAndUpdateKeywords([keywordModel], settings);

    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'parallel failure' }), settings);
    expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({
      updating: 0,
      updatingStartedAt: null,
      lastUpdateError: expect.stringContaining('parallel boom'),
    }));
    expect(results[0].updating).toBe(false);
  });

  it('uses batched retry queue removal for improved performance', async () => {
    // Setup mock data with disabled domains
    const mockKeywords = [
      {
        ID: 1,
        domain: 'disabled1.com',
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled1.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
      {
        ID: 2,
        domain: 'disabled2.com',
        get: jest.fn().mockReturnValue({ ID: 2, domain: 'disabled2.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
      {
        ID: 3,
        domain: 'disabled3.com',
        get: jest.fn().mockReturnValue({ ID: 3, domain: 'disabled3.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
    ];

    // Mock domains with scrapeEnabled: 0 to trigger the skipped keywords path
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled1.com', scrapeEnabled: 0 }) },
      { get: () => ({ domain: 'disabled2.com', scrapeEnabled: 0 }) },
      { get: () => ({ domain: 'disabled3.com', scrapeEnabled: 0 }) },
    ]);

    const { retryQueueManager } = require('../../utils/retryQueueManager');

    // Execute the function
    await refreshAndUpdateKeywords(mockKeywords, mockSettings);
    
    expect(mockKeywords[0].update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(mockKeywords[1].update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(mockKeywords[2].update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));

    // Verify batched removal was called with the correct IDs
    expect(retryQueueManager.removeBatch).toHaveBeenCalledTimes(1);
    const callArg = retryQueueManager.removeBatch.mock.calls[0][0];
    expect(callArg).toBeInstanceOf(Set);
    expect(Array.from(callArg).sort()).toEqual([1, 2, 3]);

    // Verify removeFromRetryQueue was NOT called (since we use batched operations now)
    expect(removeFromRetryQueue).not.toHaveBeenCalled();
  });

  it('handles empty skipped keywords gracefully', async () => {
    // Mock keywords that are all enabled
    const mockKeywords = [
      {
        ID: 1,
        domain: 'enabled.com',
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'enabled.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
    ]);

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should not call retry queue operations when no keywords are skipped
    const { retryQueueManager } = require('../../utils/retryQueueManager');
    expect(retryQueueManager.removeBatch).not.toHaveBeenCalled();
    expect(removeFromRetryQueue).not.toHaveBeenCalled();
  });

  it('handles retry queue operations correctly for disabled domains', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'disabled.com',
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should call removeBatch for skipped keywords from disabled domains
    const { retryQueueManager } = require('../../utils/retryQueueManager');
    expect(retryQueueManager.removeBatch).toHaveBeenCalledWith(expect.any(Set));
  });

  it('normalizes undefined scraper results before persisting', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const mockPlainKeyword = {
      ID: 42,
      keyword: 'example keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 0,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: mockPlainKeyword.ID,
      keyword: mockPlainKeyword.keyword,
      domain: mockPlainKeyword.domain,
      get: jest.fn().mockReturnValue(mockPlainKeyword),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    const updatedKeyword = {
      ID: mockPlainKeyword.ID,
      position: 7,
      url: 'https://example.com/result',
      result: undefined,
      mapPackTop3: false,
      error: 'temporary failure',
    } as RefreshResult;

    const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

    expect(keywordModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lastResult: '[]',
      }),
    );

    expect(updated.lastResult).toEqual([]);

    consoleSpy.mockRestore();
  });

  it('normalizes array scraper results correctly', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const mockPlainKeyword = {
      ID: 43,
      keyword: 'test array keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 0,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: mockPlainKeyword.ID,
      keyword: mockPlainKeyword.keyword,
      domain: mockPlainKeyword.domain,
      get: jest.fn().mockReturnValue(mockPlainKeyword),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    // Test with array result (this validates the simplified normalizeResult function)
    const arrayResult = [
      { position: 1, url: 'https://example.com', title: 'Test Result 1' },
      { position: 2, url: 'https://example2.com', title: 'Test Result 2' }
    ];

    const updatedKeyword = {
      ID: mockPlainKeyword.ID,
      position: 1,
      url: 'https://example.com',
      result: arrayResult,
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

    // Verify the array was properly JSON.stringified 
    expect(keywordModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lastResult: JSON.stringify(arrayResult),
      }),
    );

    // Verify the lastResult is parsed back to an array
    expect(updated.lastResult).toEqual(arrayResult);

    consoleSpy.mockRestore();
  });

  it('clears updating flag when keyword update fails and returns cleared state', async () => {
    const mockPlainKeyword = {
      ID: 44,
      keyword: 'failing update keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 2,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: mockPlainKeyword.ID,
      keyword: mockPlainKeyword.keyword,
      domain: mockPlainKeyword.domain,
      get: jest.fn().mockReturnValue(mockPlainKeyword),
      update: jest.fn().mockRejectedValue(new Error('db update failed')),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    const updatedKeyword = {
      ID: mockPlainKeyword.ID,
      position: 4,
      url: 'https://example.com/result',
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

    expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(updated.updating).toBe(false);
  });

  it('coerces optional scalars when scrape results omit URLs', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-20T12:00:00.000Z'));

    const mockPlainKeyword = {
      ID: 99,
      keyword: 'missing url keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 11,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: 'https://example.com/existing',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: mockPlainKeyword.ID,
      keyword: mockPlainKeyword.keyword,
      domain: mockPlainKeyword.domain,
      get: jest.fn().mockReturnValue(mockPlainKeyword),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    const updatedKeyword = {
      ID: mockPlainKeyword.ID,
      position: 5,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    try {
      await updateKeywordPosition(keywordModel, updatedKeyword, settings);

      expect(keywordModel.update).toHaveBeenCalledTimes(1);
      const payload = (keywordModel.update as jest.Mock).mock.calls[0][0];

      expect(payload.url).toBeNull();
      expect(payload.lastUpdated).toBe('2024-05-20T12:00:00.000Z');
      expect(payload.lastUpdateError).toBe('false');
      expect(payload.updating).toBe(0);
      expect(Object.values(payload).some((value) => value === undefined)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('normalizes legacy array history payloads before persisting new entries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-20T12:00:00.000Z'));

    const mockPlainKeyword = {
      ID: 77,
      keyword: 'legacy history keyword',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 8,
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '[]',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: mockPlainKeyword.ID,
      keyword: mockPlainKeyword.keyword,
      domain: mockPlainKeyword.domain,
      get: jest.fn().mockReturnValue(mockPlainKeyword),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    const updatedKeyword = {
      ID: mockPlainKeyword.ID,
      position: 3,
      url: 'https://example.com/result',
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    try {
      const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

      expect(keywordModel.update).toHaveBeenCalledTimes(1);
      const payload = (keywordModel.update as jest.Mock).mock.calls[0][0];
      const storedHistory = JSON.parse(payload.history);

      expect(storedHistory).toEqual({ '2024-5-20': 3 });
      expect(updated.history).toEqual({ '2024-5-20': 3 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('respects domain scraper overrides when determining parallel vs sequential mode', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    
    // Setup: global settings use parallel-friendly scraper (serpapi)
    // but domain override uses custom scraper (not parallel-friendly)
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'parallel.com',
          scrapeEnabled: 1,
          scraper_settings: null, // No override - will use global serpapi
        }),
      },
      {
        get: () => ({
          domain: 'sequential.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'custom-scraper',
            scraping_api: cryptr.encrypt('custom-key'),
          }),
        }),
      },
    ]);

    const keyword1Plain = {
      ID: 100,
      keyword: 'keyword1',
      domain: 'parallel.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 1,
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

    const keyword2Plain = {
      ID: 101,
      keyword: 'keyword2',
      domain: 'sequential.com', // Has override to custom-scraper
      device: 'desktop',
      country: 'US',
      location: '',
      position: 2,
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

    const keywordModel1 = {
      ID: keyword1Plain.ID,
      keyword: keyword1Plain.keyword,
      domain: keyword1Plain.domain,
      get: jest.fn().mockReturnValue(keyword1Plain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    const keywordModel2 = {
      ID: keyword2Plain.ID,
      keyword: keyword2Plain.keyword,
      domain: keyword2Plain.domain,
      get: jest.fn().mockReturnValue(keyword2Plain),
      set: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValue({
      ID: keyword1Plain.ID,
      position: 1,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult);

    const settings = {
      scraper_type: 'serpapi', // Global setting is parallel-friendly
      scrape_retry: false,
    } as SettingsType;

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await refreshAndUpdateKeywords([keywordModel1, keywordModel2], settings);

    // Should use sequential mode because keyword2 has a custom-scraper override
    // which is not in the parallel-friendly list
    // Note: START SCRAPE is logged at DEBUG level, which may not be visible by default
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"INFO"'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Keyword refresh completed'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Parallel keyword refresh completed')); // This is only logged in parallel mode

    consoleSpy.mockRestore();
  });

  it('uses parallel mode when all domain overrides are parallel-friendly', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    
    // Setup: domain overrides use parallel-friendly scrapers
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'domain1.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'scrapingant',
            scraping_api: cryptr.encrypt('key1'),
          }),
        }),
      },
      {
        get: () => ({
          domain: 'domain2.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'searchapi',
            scraping_api: cryptr.encrypt('key2'),
          }),
        }),
      },
    ]);

    const keyword1Plain = {
      ID: 200,
      keyword: 'parallel-keyword1',
      domain: 'domain1.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 1,
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

    const keyword2Plain = {
      ID: 201,
      keyword: 'parallel-keyword2',
      domain: 'domain2.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 2,
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

    const keywordModel1 = {
      ID: keyword1Plain.ID,
      keyword: keyword1Plain.keyword,
      domain: keyword1Plain.domain,
      get: jest.fn().mockReturnValue(keyword1Plain),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const keywordModel2 = {
      ID: keyword2Plain.ID,
      keyword: keyword2Plain.keyword,
      domain: keyword2Plain.domain,
      get: jest.fn().mockReturnValue(keyword2Plain),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValue({
      ID: keyword1Plain.ID,
      position: 1,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult);

    const settings = {
      scraper_type: 'custom-scraper', // Global is NOT parallel-friendly
      scrape_retry: false,
    } as SettingsType;

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await refreshAndUpdateKeywords([keywordModel1, keywordModel2], settings);

    // Should use parallel mode because both domain overrides are parallel-friendly
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"INFO"'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel keyword refresh completed')); // This is only logged in parallel mode
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('START SCRAPE:'));

    consoleSpy.mockRestore();
  });

  it('handles various position input types correctly with simplified logic', async () => {
    // Test the simplified newPos logic: Number(updatedKeyword.position ?? keyword.position ?? 0) || 0
    const baseKeyword = {
      ID: 999,
      keyword: 'test keyword',
      domain: 'test.com',
      device: 'desktop',
      country: 'US',
      location: 'US',
      position: 5, // fallback position
      volume: 0,
      updating: 1,
      sticky: 0,
      history: '{}',
      lastResult: '[]',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      lastUpdateError: 'false',
    };

    const keywordModel = {
      ID: baseKeyword.ID,
      keyword: baseKeyword.keyword,
      domain: baseKeyword.domain,
      get: jest.fn().mockReturnValue(baseKeyword),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    const settings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    // Test case 1: number position
    let updatedKeyword = {
      ID: baseKeyword.ID,
      position: 3,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(3);

    // Test case 2: string number position
    (keywordModel.update as jest.Mock).mockClear();
    updatedKeyword = {
      ID: baseKeyword.ID,
      position: '7' as any,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(7);

    // Test case 3: undefined position (should use keyword fallback)
    (keywordModel.update as jest.Mock).mockClear();
    updatedKeyword = {
      ID: baseKeyword.ID,
      position: undefined,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(5); // fallback to keyword.position

    // Test case 4: null position (should use keyword fallback)
    (keywordModel.update as jest.Mock).mockClear();
    updatedKeyword = {
      ID: baseKeyword.ID,
      position: null as any,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(5); // fallback to keyword.position

    // Test case 5: invalid string position (should use final fallback of 0)
    (keywordModel.update as jest.Mock).mockClear();
    const keywordWithUndefinedPos = { ...baseKeyword, position: undefined };
    (keywordModel.get as jest.Mock).mockReturnValue(keywordWithUndefinedPos);
    updatedKeyword = {
      ID: baseKeyword.ID,
      position: 'invalid' as any,
      result: [],
      mapPackTop3: false,
      error: false,
    } as RefreshResult;

    await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(0); // final fallback
  });

  it('ensures updating flag is cleared when parallel refresh returns empty results', async () => {
    const keywordPlain = {
      ID: 88,
      keyword: 'empty result test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      location: '',
      position: 4,
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
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    // Mock scraper to return false (failure), which creates an error result in refreshParallel
    // This error result will be processed by updateKeywordPosition, which sets updating: 0
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce(false);
    const settings = {
      scraper_type: 'serpapi', // parallel scraper
      scrape_retry: false,
    } as SettingsType;

    const results = await refreshAndUpdateKeywords([keywordModel], settings);

    // When scraper returns false, refreshParallel creates an error result that is processed
    // by updateKeywordPosition, which sets updating: 0 in the database via keywordModel.update
    expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({
      updating: 0,
      updatingStartedAt: null,
    }));

    // Verify the returned result has updating: 0 (converted for UI)
    expect(results).toHaveLength(1);
    expect(results[0].updating).toBe(false);
  });

  it('handles errors gracefully during parallel refresh and ensures updating flags are cleared', async () => {
    const keywords = [
      {
        ID: 101,
        keyword: 'keyword 1',
        domain: 'example.com',
        get: jest.fn().mockReturnValue({ ID: 101, keyword: 'keyword 1', domain: 'example.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
      {
        ID: 102,
        keyword: 'keyword 2',
        domain: 'example.com',
        get: jest.fn().mockReturnValue({ ID: 102, keyword: 'keyword 2', domain: 'example.com' }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    // Simulate errors in the scraping process
    // refreshParallel catches these and creates error results, so no exception is thrown
    (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValue(new Error('Unexpected error'));
    const settings = {
      scraper_type: 'serpapi', // parallel scraper
      scrape_retry: false,
    } as SettingsType;

    // The function should not throw - it handles errors gracefully
    const results = await refreshAndUpdateKeywords(keywords as unknown as Keyword[], settings);

    // Verify that keywords were processed despite errors
    expect(results).toHaveLength(2);
    
    // Verify all keywords have updating: 0
    expect(results[0].updating).toBe(false);
    expect(results[1].updating).toBe(false);

    // Verify that update was called to clear the updating flags
    expect(keywords[0].update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
    expect(keywords[1].update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
  });

  it('applies refresh_batch_size and preserves desktop fallback ordering per domain', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    const domains = [
      {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'valueserp',
            scraping_api: cryptr.encrypt('value-key'),
          }),
        }),
      },
      {
        get: () => ({
          domain: 'other.com',
          scrapeEnabled: 1,
          scraper_settings: JSON.stringify({
            scraper_type: 'custom-scraper',
            scraping_api: cryptr.encrypt('value-key'),
          }),
        }),
      },
    ];
    (Domain.findAll as jest.Mock).mockResolvedValue(domains);

    const makeKeyword = (id: number, device: string, domain: string) => {
      const keywordPlain = {
        ID: id,
        keyword: `keyword-${id}`,
        domain,
        device,
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
      return {
        ID: id,
        keyword: keywordPlain.keyword,
        domain,
        get: jest.fn().mockReturnValue(keywordPlain),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;
    };

    const keywordModels = [
      makeKeyword(1, 'desktop', 'example.com'),
      makeKeyword(2, 'mobile', 'example.com'),
      makeKeyword(3, 'desktop', 'example.com'),
      makeKeyword(4, 'mobile', 'example.com'),
      makeKeyword(5, 'desktop', 'other.com'),
      makeKeyword(6, 'mobile', 'other.com'),
    ];

    const callLog: Array<{ id: number; device: string; fallback?: number }> = [];
    (scrapeKeywordFromGoogle as jest.Mock).mockImplementation(async (_keyword: KeywordType, settings: SettingsType & { fallback_mapPackTop3?: number }) => {
      const id = _keyword.ID as number;
      callLog.push({ id, device: _keyword.device, fallback: settings.fallback_mapPackTop3 });
      return {
        ID: id,
        position: 1,
        result: [],
        mapPackTop3: _keyword.device === 'desktop',
        error: false,
      } as RefreshResult;
    });

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
      refresh_batch_size: 2,
    } as SettingsType;

    await refreshAndUpdateKeywords(keywordModels, settings);

    const exampleCalls = callLog.filter((entry) => [1, 2, 3, 4].includes(entry.id));
    expect(exampleCalls.map((entry) => entry.id)).toEqual([1, 3, 2, 4]);
    expect(exampleCalls.find((entry) => entry.id === 2)?.fallback).toBe(1);
    expect(exampleCalls.find((entry) => entry.id === 4)?.fallback).toBe(1);

    const otherCalls = callLog.filter((entry) => [5, 6].includes(entry.id));
    expect(otherCalls.map((entry) => entry.id)).toEqual([5, 6]);
    expect(otherCalls.find((entry) => entry.id === 6)?.fallback).toBeUndefined();
  });
});
