import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../utils/refresh';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import type { RefreshResult } from '../../utils/scraper';
import { toDbBool } from '../../utils/dbBooleans';

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

// Mock updateDomainStats
jest.mock('../../utils/updateDomainStats', () => ({
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));

describe('Atomic Flag Clearing in Refresh Workflow', () => {
  const mockSettings = {
    scraper_type: 'serpapi',
    scrape_retry: false,
  } as SettingsType;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret';
  });

  describe('updateKeywordPosition', () => {
    it('should clear updating flag atomically in the same update', async () => {
      const mockKeywordModel = {
        ID: 1,
        domain: 'example.com',
        keyword: 'test keyword',
        updating: toDbBool(true),
        updatingStartedAt: new Date().toJSON(),
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'example.com',
          keyword: 'test keyword',
          position: 5,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      const mockRefreshResult: RefreshResult = {
        ID: 1,
        keyword: 'test keyword',
        position: 3,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      };

      await updateKeywordPosition(
        mockKeywordModel as unknown as Keyword,
        mockRefreshResult,
        mockSettings
      );

      // Verify that update was called with updating: false and updatingStartedAt: null
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
          position: 3,
        })
      );

      // Verify it was only called once (atomic update)
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
    });

    it('should clear updating flag even when scraper returns error', async () => {
      const mockKeywordModel = {
        ID: 2,
        domain: 'example.com',
        keyword: 'error keyword',
        updating: toDbBool(true),
        updatingStartedAt: new Date().toJSON(),
        get: jest.fn().mockReturnValue({
          ID: 2,
          domain: 'example.com',
          keyword: 'error keyword',
          position: 5,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      const mockRefreshResult: RefreshResult = {
        ID: 2,
        keyword: 'error keyword',
        position: 5,
        url: '',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: 'Scraper failed',
      };

      await updateKeywordPosition(
        mockKeywordModel as unknown as Keyword,
        mockRefreshResult,
        mockSettings
      );

      // Verify that update was called with updating: false even with error
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
        })
      );

      // Verify lastUpdateError is set
      const updateCall = mockKeywordModel.update.mock.calls[0][0];
      expect(updateCall.lastUpdateError).not.toBe('false');
      expect(JSON.parse(updateCall.lastUpdateError)).toMatchObject({
        error: 'Scraper failed',
        scraper: 'serpapi',
      });
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
    });

    it('should return correct in-memory state when keyword.update() throws', async () => {
      // This test verifies single-write semantics: when the DB update fails,
      // no fallback update is attempted. The keyword will remain in "updating" 
      // state in the database until the next refresh or cleanup cycle, but
      // the in-memory state returned to the caller is correctly cleared.
      const mockKeywordModel = {
        ID: 10,
        domain: 'example.com',
        keyword: 'db failure keyword',
        updating: toDbBool(true),
        updatingStartedAt: new Date().toJSON(),
        get: jest.fn().mockReturnValue({
          ID: 10,
          domain: 'example.com',
          keyword: 'db failure keyword',
          position: 5,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockRejectedValueOnce(new Error('DB write failed')),
      };

      const mockRefreshResult: RefreshResult = {
        ID: 10,
        keyword: 'db failure keyword',
        position: 3,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      };

      const result = await updateKeywordPosition(
        mockKeywordModel as unknown as Keyword,
        mockRefreshResult,
        mockSettings
      );

      // Verify that update was called only once (no fallback)
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);

      // Call should have full update payload
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
          position: 3,
        })
      );

      // Verify in-memory state is correct even though DB update failed
      // Note: The database state will NOT be updated (keyword remains in "updating" state)
      // but the returned object has correct in-memory state for the refresh result
      expect(result).toMatchObject({
        updating: false,
        updatingStartedAt: null,
      });
    });
  });

  describe('refreshAndUpdateKeywords', () => {
    it('should not call separate flag clearing after successful refresh', async () => {
      const mockKeywordModel = {
        ID: 3,
        domain: 'example.com',
        keyword: 'success keyword',
        updating: toDbBool(true),
        get: jest.fn().mockReturnValue({
          ID: 3,
          domain: 'example.com',
          keyword: 'success keyword',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'example.com',
            scrapeEnabled: 1,
          }),
        },
      ]);

      (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValue({
        ID: 3,
        keyword: 'success keyword',
        position: 2,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
        error: false,
      });

      await refreshAndUpdateKeywords(
        [mockKeywordModel as unknown as Keyword],
        mockSettings
      );

      // Verify update was called (should be for the actual keyword update, not separate flag clearing)
      expect(mockKeywordModel.update).toHaveBeenCalled();
      
      // Get all update calls
      const updateCalls = mockKeywordModel.update.mock.calls;
      
      // All updates should include updating: false and updatingStartedAt: null
      // There should be no separate flag-clearing update after the main update
      updateCalls.forEach((call) => {
        const payload = call[0];
        expect(payload).toMatchObject({
          updating: toDbBool(false),
          updatingStartedAt: null,
        });
      });
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
    });

    it('should clear flags for skipped keywords (scraping disabled)', async () => {
      const mockKeywordModel = {
        ID: 4,
        domain: 'disabled.com',
        keyword: 'skipped keyword',
        updating: toDbBool(true),
        get: jest.fn().mockReturnValue({
          ID: 4,
          domain: 'disabled.com',
          keyword: 'skipped keyword',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'disabled.com',
            scrapeEnabled: 0, // Scraping disabled
          }),
        },
      ]);

      await refreshAndUpdateKeywords(
        [mockKeywordModel as unknown as Keyword],
        mockSettings
      );

      // Verify scraper was never called for this keyword
      expect(scrapeKeywordFromGoogle).not.toHaveBeenCalled();

      // Verify per-row update clears flags once
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
        }),
      );
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
    });

    it('should clear flags in error handler when unexpected error occurs', async () => {
      const mockKeywordModel = {
        ID: 5,
        domain: 'example.com',
        keyword: 'error keyword',
        updating: toDbBool(true),
        get: jest.fn().mockReturnValue({
          ID: 5,
          domain: 'example.com',
          keyword: 'error keyword',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'example.com',
            scrapeEnabled: 1,
          }),
        },
      ]);

      // Mock scraper to throw an error
      (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValue(
        new Error('Unexpected scraper error')
      );

      // The function handles the error internally and returns the keyword with error details
      // It no longer throws errors to the caller
      const result = await refreshAndUpdateKeywords(
        [mockKeywordModel as unknown as Keyword],
        mockSettings
      );

      // Verify that the keyword was returned with error information
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ID: 5,
        keyword: 'error keyword',
        updating: false,
        updatingStartedAt: null,
      });

      // Verify updating flag was cleared
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
        })
      );

      // Verify error was logged in the keyword
      const updateCall = mockKeywordModel.update.mock.calls[0][0];
      expect(updateCall.lastUpdateError).toBeDefined();
      expect(updateCall.lastUpdateError).not.toBe('false');
      expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('Parallel refresh workflow', () => {
    it('should clear flags atomically for parallel scrapers', async () => {
      const mockKeywordModel1 = {
        ID: 6,
        domain: 'example.com',
        keyword: 'parallel keyword 1',
        updating: toDbBool(true),
        get: jest.fn().mockReturnValue({
          ID: 6,
          domain: 'example.com',
          keyword: 'parallel keyword 1',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      const mockKeywordModel2 = {
        ID: 7,
        domain: 'example.com',
        keyword: 'parallel keyword 2',
        updating: toDbBool(true),
        get: jest.fn().mockReturnValue({
          ID: 7,
          domain: 'example.com',
          keyword: 'parallel keyword 2',
          position: 0,
          history: {},
          lastUpdated: '',
          url: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'example.com',
            scrapeEnabled: 1,
          }),
        },
      ]);

      // Mock parallel scraper
      (scrapeKeywordFromGoogle as jest.Mock)
        .mockResolvedValueOnce({
          ID: 6,
          keyword: 'parallel keyword 1',
          position: 1,
          url: 'https://example.com/1',
          result: [],
          localResults: [],
          mapPackTop3: false,
          error: false,
        })
        .mockResolvedValueOnce({
          ID: 7,
          keyword: 'parallel keyword 2',
          position: 2,
          url: 'https://example.com/2',
          result: [],
          localResults: [],
          mapPackTop3: false,
          error: false,
        });

      await refreshAndUpdateKeywords(
        [
          mockKeywordModel1 as unknown as Keyword,
          mockKeywordModel2 as unknown as Keyword,
        ],
        { ...mockSettings, scraper_type: 'serpapi' } // Parallel scraper
      );

      // Verify both keywords had their flags cleared atomically
      expect(mockKeywordModel1.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
        })
      );
      expect(mockKeywordModel2.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: toDbBool(false),
          updatingStartedAt: null,
        })
      );

      // Verify each keyword was only updated once (atomic)
      expect(mockKeywordModel1.update).toHaveBeenCalledTimes(1);
      expect(mockKeywordModel2.update).toHaveBeenCalledTimes(1);
    });
  });
});
