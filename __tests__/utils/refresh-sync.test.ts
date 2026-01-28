/**
 * Tests for database-memory synchronization in keyword refresh operations
 * These tests verify that in-memory Sequelize models stay in sync with database state
 * after update operations, preventing stale data issues.
 */

import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../utils/refresh';
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

jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    removeBatch: jest.fn().mockResolvedValue(undefined),
    getQueue: jest.fn().mockResolvedValue([]),
  },
}));

describe('Database-Memory Synchronization in Keyword Refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret';
  });

  describe('updateKeywordPosition', () => {
    it('updates the database to sync in-memory state', async () => {
      const mockKeywordModel = {
        ID: 1,
        keyword: 'test keyword',
        domain: 'example.com',
        position: 0,
        updating: 1,
        get: jest.fn().mockReturnValue({
          ID: 1,
          keyword: 'test keyword',
          domain: 'example.com',
          position: 0,
          updating: false,
          history: {},
          lastUpdated: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      const refreshResult: RefreshResult = {
        ID: 1,
        keyword: 'test keyword',
        position: 5,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
      };

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await updateKeywordPosition(mockKeywordModel, refreshResult, settings);

      // Verify update was called
      expect(mockKeywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 5,
          updating: 0,
          updatingStartedAt: null,
        }),
      );

    });

    it('does not rely on a reload function for test mocks', async () => {
      const mockKeywordModelWithoutReload = {
        ID: 2,
        keyword: 'test keyword 2',
        domain: 'example.com',
        position: 0,
        updating: 1,
        get: jest.fn().mockReturnValue({
          ID: 2,
          keyword: 'test keyword 2',
          domain: 'example.com',
          position: 0,
          updating: false,
          history: {},
          lastUpdated: '',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      const refreshResult: RefreshResult = {
        ID: 2,
        keyword: 'test keyword 2',
        position: 10,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
      };

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      // Should not throw error even without reload method
      await expect(
        updateKeywordPosition(mockKeywordModelWithoutReload, refreshResult, settings),
      ).resolves.toBeDefined();

      // Verify update was still called
      expect(mockKeywordModelWithoutReload.update).toHaveBeenCalled();
    });
  });

  describe('refreshAndUpdateKeywords', () => {
    it('updates keywords after bulk updates', async () => {
      const mockKeyword1 = {
        ID: 1,
        keyword: 'keyword 1',
        domain: 'example.com',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 1,
          keyword: 'keyword 1',
          domain: 'example.com',
        }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      const mockKeyword2 = {
        ID: 2,
        keyword: 'keyword 2',
        domain: 'example.com',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 2,
          keyword: 'keyword 2',
          domain: 'example.com',
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

      // Mock Keyword.findAll for updateDomainStats
      (Keyword.findAll as jest.Mock).mockResolvedValue([mockKeyword1, mockKeyword2]);

      (scrapeKeywordFromGoogle as jest.Mock)
        .mockResolvedValueOnce({
          ID: 1,
          keyword: 'keyword 1',
          position: 3,
          url: 'https://example.com',
          result: [],
          localResults: [],
          mapPackTop3: false,
        })
        .mockResolvedValueOnce({
          ID: 2,
          keyword: 'keyword 2',
          position: 7,
          url: 'https://example.com',
          result: [],
          localResults: [],
          mapPackTop3: false,
        });

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await refreshAndUpdateKeywords(
        [mockKeyword1 as unknown as Keyword, mockKeyword2 as unknown as Keyword],
        settings,
      );

      // Both keywords should have been updated
      expect(mockKeyword1.update).toHaveBeenCalled();
      expect(mockKeyword2.update).toHaveBeenCalled();
    });

    it('updates keyword flags after error handling', async () => {
      const mockKeyword = {
        ID: 3,
        keyword: 'error keyword',
        domain: 'example.com',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 3,
          keyword: 'error keyword',
          domain: 'example.com',
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

      // Mock Keyword.findAll for updateDomainStats
      (Keyword.findAll as jest.Mock).mockResolvedValue([mockKeyword]);

      // Simulate scraper error
      (scrapeKeywordFromGoogle as jest.Mock).mockRejectedValueOnce(
        new Error('Scraper API error'),
      );

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await refreshAndUpdateKeywords([mockKeyword as unknown as Keyword], settings);

      // Keyword should be updated to clear updating flag
      expect(mockKeyword.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: 0,
          updatingStartedAt: null,
        }),
      );

    });
  });

  describe('Concurrency and Race Condition Prevention', () => {
    it('does not use manual .set() calls that could cause state divergence', async () => {
      const mockKeyword = {
        ID: 4,
        keyword: 'concurrent keyword',
        domain: 'example.com',
        updating: 0,
        get: jest.fn().mockReturnValue({
          ID: 4,
          keyword: 'concurrent keyword',
          domain: 'example.com',
          position: 0,
          history: {},
        }),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(), // Mock set to verify it's NOT called
      } as unknown as Keyword;

      const refreshResult: RefreshResult = {
        ID: 4,
        keyword: 'concurrent keyword',
        position: 15,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
      };

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await updateKeywordPosition(mockKeyword, refreshResult, settings);

      // Verify .set() was NOT called - we rely on .update() instead
      expect(mockKeyword.set).not.toHaveBeenCalled();
      
      // Verify we use the correct sync pattern
      expect(mockKeyword.update).toHaveBeenCalled();
    });
  });
});
