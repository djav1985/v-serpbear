/**
 * Tests for history trimming optimization
 */

import { updateKeywordPosition } from '../../utils/refresh';
import Keyword from '../../database/models/keyword';

jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
   retryScrape: jest.fn(),
   removeFromRetryQueue: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
   logger: {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
   },
}));

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
