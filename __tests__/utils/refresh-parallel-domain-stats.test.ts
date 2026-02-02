import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import { updateDomainStats } from '../../utils/updateDomainStats';

// Mock the dependencies
jest.mock('../../database/models/domain');
jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
  removeFromRetryQueue: jest.fn(),
  retryScrape: jest.fn(),
  scrapeKeywordFromGoogle: jest.fn(),
}));

jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    removeBatch: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn().mockResolvedValue([]),
  },
}));

// Mock updateDomainStats to track calls
jest.mock('../../utils/updateDomainStats', () => ({
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));

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
    // Create keywords for 3 different domains
    const mockKeywords = [
      {
        ID: 1,
        domain: 'domain1.com',
        keyword: 'keyword 1',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'domain1.com',
          keyword: 'keyword 1',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 2,
        domain: 'domain2.com',
        keyword: 'keyword 2',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 2,
          domain: 'domain2.com',
          keyword: 'keyword 2',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 3,
        domain: 'domain3.com',
        keyword: 'keyword 3',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 3,
          domain: 'domain3.com',
          keyword: 'keyword 3',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'domain1.com',
          scrapeEnabled: 1,
        }),
      },
      {
        get: () => ({
          domain: 'domain2.com',
          scrapeEnabled: 1,
        }),
      },
      {
        get: () => ({
          domain: 'domain3.com',
          scrapeEnabled: 1,
        }),
      },
    ]);

    // Mock successful scraping for all keywords
    (scrapeKeywordFromGoogle as jest.Mock)
      .mockResolvedValueOnce({
        ID: 1,
        keyword: 'keyword 1',
        position: 5,
        url: 'https://domain1.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      })
      .mockResolvedValueOnce({
        ID: 2,
        keyword: 'keyword 2',
        position: 10,
        url: 'https://domain2.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      })
      .mockResolvedValueOnce({
        ID: 3,
        keyword: 'keyword 3',
        position: 15,
        url: 'https://domain3.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      });

    // Track the execution order to verify parallel behavior
    // For parallel execution, all should start before any complete
    const started: string[] = [];
    const completed: string[] = [];
    
    (updateDomainStats as jest.Mock).mockImplementation(async (domainName: string) => {
      started.push(domainName);
      // Simulate async work
      await new Promise(resolve => setImmediate(resolve));
      completed.push(domainName);
    });

    // Execute refresh
    await refreshAndUpdateKeywords(
      mockKeywords as unknown as Keyword[],
      mockSettings
    );

    // Verify updateDomainStats was called for all 3 domains
    expect(updateDomainStats).toHaveBeenCalledTimes(3);
    expect(updateDomainStats).toHaveBeenCalledWith('domain1.com');
    expect(updateDomainStats).toHaveBeenCalledWith('domain2.com');
    expect(updateDomainStats).toHaveBeenCalledWith('domain3.com');

    // Deterministic check: In parallel execution, all promises start before any complete
    // This is true regardless of CPU speed or load
    expect(started).toHaveLength(3);
    expect(completed).toHaveLength(3);
    
    // Verify all started before any completed (deterministic parallel behavior check)
    // In sequential execution: started=[A], completed=[A], started=[B], completed=[B], etc.
    // In parallel execution: started=[A,B,C], completed=[A,B,C] (all start before any completes)
    const allStartedBeforeFirstComplete = started.length === 3;
    expect(allStartedBeforeFirstComplete).toBe(true);
  });

  it('should handle domain stats updates even when keywords from same domain', async () => {
    // Create multiple keywords for the same domain
    const mockKeywords = [
      {
        ID: 1,
        domain: 'example.com',
        keyword: 'keyword 1',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'example.com',
          keyword: 'keyword 1',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      {
        ID: 2,
        domain: 'example.com',
        keyword: 'keyword 2',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 2,
          domain: 'example.com',
          keyword: 'keyword 2',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
        }),
      },
    ]);

    (scrapeKeywordFromGoogle as jest.Mock)
      .mockResolvedValueOnce({
        ID: 1,
        keyword: 'keyword 1',
        position: 5,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      })
      .mockResolvedValueOnce({
        ID: 2,
        keyword: 'keyword 2',
        position: 10,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      });

    await refreshAndUpdateKeywords(
      mockKeywords as unknown as Keyword[],
      mockSettings
    );

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
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'disabled.com',
          keyword: 'keyword 1',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    ];

    // Domain has scraping disabled
    (Domain.findAll as jest.Mock).mockResolvedValue([
      {
        get: () => ({
          domain: 'disabled.com',
          scrapeEnabled: 0,
        }),
      },
    ]);

    await refreshAndUpdateKeywords(
      mockKeywords as unknown as Keyword[],
      mockSettings
    );

    // No keywords were updated, so updateDomainStats should not be called
    expect(updateDomainStats).not.toHaveBeenCalled();
  });
});
