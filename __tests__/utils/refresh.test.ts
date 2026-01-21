import { readFile, writeFile } from 'fs/promises';
import { Op } from 'sequelize';
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

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
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
      updating: false,
      get: jest.fn().mockReturnValue({
        ID: 101,
        domain: 'example.com',
        keyword: 'example keyword',
      }),
      set: jest.fn(),
      update: jest.fn(),
    };

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValue(new Error('network boom'));

    const mockSettings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
    } as SettingsType;

    await refreshAndUpdateKeywords([mockKeywordModel as unknown as Keyword], mockSettings);

    expect(Keyword.update).toHaveBeenCalledTimes(1);
    expect(Keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({ updating: false }),
      { where: { ID: mockKeywordModel.ID } },
    );
    expect(mockKeywordModel.set).toHaveBeenCalledWith(expect.objectContaining({ updating: false }));
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
      update: jest.fn(),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce(false);

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: true,
    } as SettingsType;

    await refreshAndUpdateKeywords([keywordModel], settings);

    expect(keywordModel.set).toHaveBeenCalledWith(expect.objectContaining({ updating: false }));
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
      update: jest.fn(),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValueOnce(false);

    const settings = {
      scraper_type: 'custom-scraper',
      scrape_retry: false,
    } as SettingsType;

    await refreshAndUpdateKeywords([keywordModel], settings);

    expect(keywordModel.set).toHaveBeenCalledWith(expect.objectContaining({ updating: false }));
    expect(removeFromRetryQueue).toHaveBeenCalledWith(42);
    expect(retryScrape).not.toHaveBeenCalled();
  });

  it('applies per-domain scraper overrides when scraping keywords', async () => {
    const cryptr = new Cryptr(process.env.SECRET as string);
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'override.com',
          scrapeEnabled: true,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
    };

    const keywordModel = {
      ID: keywordPlain.ID,
      keyword: keywordPlain.keyword,
      domain: keywordPlain.domain,
      get: jest.fn().mockReturnValue(keywordPlain),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
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
        update: jest.fn(),
      },
      {
        ID: 2,
        domain: 'disabled2.com',
        get: jest.fn().mockReturnValue({ ID: 2, domain: 'disabled2.com' }),
        update: jest.fn(),
      },
      {
        ID: 3,
        domain: 'disabled3.com',
        get: jest.fn().mockReturnValue({ ID: 3, domain: 'disabled3.com' }),
        update: jest.fn(),
      },
    ];

    // Mock domains with scrapeEnabled: false to trigger the skipped keywords path
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled1.com', scrapeEnabled: false }) },
      { get: () => ({ domain: 'disabled2.com', scrapeEnabled: false }) },
      { get: () => ({ domain: 'disabled3.com', scrapeEnabled: false }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([3]);

    // Mock readFile to return a queue with some existing items and the skipped IDs
    const mockQueue = JSON.stringify([1, 2, 3, 4, 5]); // IDs 1,2,3 should be removed
    (readFile as jest.Mock).mockResolvedValue(mockQueue);
    (writeFile as jest.Mock).mockResolvedValue(undefined);

    // Execute the function
    await refreshAndUpdateKeywords(mockKeywords, mockSettings);
    // Verify Op.in was used correctly
    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: false },
      { where: { ID: { [Op.in]: [1, 2, 3] } } },
    );

    // Verify batched file operations
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(
      `${process.cwd()}/data/failed_queue.json`,
      { encoding: 'utf-8' }
    );

    // Verify writeFile was called with filtered queue (removing IDs 1, 2, 3)
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      `${process.cwd()}/data/failed_queue.json`,
      JSON.stringify([4, 5]), // Only IDs 4 and 5 should remain
      { encoding: 'utf-8' }
    );

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
        update: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrapeEnabled: true }) },
    ]);

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should not perform file operations when no keywords are skipped
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(removeFromRetryQueue).not.toHaveBeenCalled();
  });

  it('handles missing retry queue file gracefully', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'disabled.com',
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled.com' }),
        update: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: false }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);

    // Mock readFile to reject with ENOENT error (file not found)
    (readFile as jest.Mock).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should handle missing file gracefully without logging error
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[ERROR] Failed to update retry queue:'));

    consoleSpy.mockRestore();
  });

  it('handles other file errors appropriately', async () => {
    const mockKeywords = [
      {
        ID: 1,
        domain: 'disabled.com',
        get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled.com' }),
        update: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: false }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);

    // Mock readFile to reject with permission error
    const permissionError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    (readFile as jest.Mock).mockRejectedValue(permissionError);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should log non-ENOENT errors
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"ERROR"'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Failed to update retry queue:'));

    consoleSpy.mockRestore();
  });

  it('skips writeFile when queue is unchanged', async () => {
    const mockKeywords = [
      {
        ID: 99,
        domain: 'disabled.com',
        get: jest.fn().mockReturnValue({ ID: 99, domain: 'disabled.com' }),
        update: jest.fn(),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: false }) },
    ]);

    (Keyword.update as jest.Mock).mockResolvedValue([1]);

    // Mock readFile to return a queue without the skipped ID (no changes needed)
    const mockQueue = JSON.stringify([1, 2, 3]); // ID 99 is not in the queue
    (readFile as jest.Mock).mockResolvedValue(mockQueue);
    (writeFile as jest.Mock).mockResolvedValue(undefined);

    await refreshAndUpdateKeywords(mockKeywords, mockSettings);

    // Should read but not write when no changes are needed
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('normalises undefined scraper results before persisting', async () => {
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
      updating: true,
      sticky: false,
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

  it('normalises array scraper results correctly', async () => {
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
      updating: true,
      sticky: false,
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
      updating: true,
      sticky: false,
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

  it('normalises legacy array history payloads before persisting new entries', async () => {
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
      updating: true,
      sticky: false,
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
          scrapeEnabled: true,
          scraper_settings: null, // No override - will use global serpapi
        }),
      },
      {
        get: () => ({
          domain: 'sequential.com',
          scrapeEnabled: true,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
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

    (Keyword.update as jest.Mock).mockResolvedValue([2]);
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
          scrapeEnabled: true,
          scraper_settings: JSON.stringify({
            scraper_type: 'scrapingant',
            scraping_api: cryptr.encrypt('key1'),
          }),
        }),
      },
      {
        get: () => ({
          domain: 'domain2.com',
          scrapeEnabled: true,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
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
      updating: true,
      sticky: false,
      history: '{}',
      lastResult: '[]',
      lastUpdateError: 'false',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      url: '',
      tags: '[]',
      mapPackTop3: 0,
    };

    const keywordModel1 = {
      ID: keyword1Plain.ID,
      keyword: keyword1Plain.keyword,
      domain: keyword1Plain.domain,
      get: jest.fn().mockReturnValue(keyword1Plain),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    const keywordModel2 = {
      ID: keyword2Plain.ID,
      keyword: keyword2Plain.keyword,
      domain: keyword2Plain.domain,
      get: jest.fn().mockReturnValue(keyword2Plain),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Keyword;

    (Keyword.update as jest.Mock).mockResolvedValue([2]);
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
      updating: true,
      sticky: false,
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
});
