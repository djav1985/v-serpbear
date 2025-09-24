import { readFile, writeFile } from 'fs/promises';
import { Op } from 'sequelize';
import Domain from '../../app/database/models/domain';
import Keyword from '../../app/database/models/keyword';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../app/utils/refresh';
import { removeFromRetryQueue } from '../../app/utils/scraper';
import type { RefreshResult } from '../../app/utils/scraper';

// Mock the dependencies
jest.mock('../../app/database/models/domain');
jest.mock('../../app/database/models/keyword');
jest.mock('../../app/utils/scraper', () => ({
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

    // Mock domains with scrape_enabled: false to trigger the skipped keywords path
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled1.com', scrape_enabled: false }) },
      { get: () => ({ domain: 'disabled2.com', scrape_enabled: false }) },
      { get: () => ({ domain: 'disabled3.com', scrape_enabled: false }) },
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
      { get: () => ({ domain: 'enabled.com', scrape_enabled: true }) },
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
      { get: () => ({ domain: 'disabled.com', scrape_enabled: false }) },
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
      { get: () => ({ domain: 'disabled.com', scrape_enabled: false }) },
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
    expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Failed to update retry queue:', permissionError);

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
      { get: () => ({ domain: 'disabled.com', scrape_enabled: false }) },
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

    let updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);
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

    updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);
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

    updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);
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

    updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);
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

    updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);
    expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(0); // final fallback
  });
});
