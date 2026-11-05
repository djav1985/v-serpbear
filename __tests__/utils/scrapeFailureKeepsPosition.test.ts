/**
 * A keyword whose scrape request keeps failing (e.g. "This operation was aborted") must come back
 * as an error with its previous position, not as position 0.
 */

import { scrapeKeywordWithStrategy } from '../../utils/scraper';

const keywordAtPosition7: KeywordType = {
   ID: 1,
   keyword: 'real estate web designer near me',
   domain: 'example.com',
   device: 'desktop',
   country: 'US',
   position: 7,
   url: 'https://example.com/',
   history: {},
   lastResult: [],
   tags: [],
   volume: 0,
   lastUpdated: '',
   added: '',
   updating: false,
   lastUpdateError: false,
   sticky: false,
   mapPackTop3: false,
   location: '',
};

const serperSettings = {
   scraper_type: 'serper',
   scraping_api: 'test-key',
   scrape_strategy: 'basic',
   scrape_pagination_limit: 5,
} as unknown as SettingsType;

describe('scrapeKeywordWithStrategy when every request fails', () => {
   let fetchSpy: jest.SpyInstance;

   beforeEach(() => {
      jest.useFakeTimers();
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
         const err = new Error('This operation was aborted');
         err.name = 'AbortError';
         return Promise.reject(err);
      });
   });

   afterEach(() => {
      fetchSpy.mockRestore();
      jest.useRealTimers();
   });

   it('returns an error and keeps the previous position instead of 0', async () => {
      const pending = scrapeKeywordWithStrategy(keywordAtPosition7, serperSettings);
      await jest.runAllTimersAsync();
      const result = (await pending) as Exclude<Awaited<typeof pending>, false>;

      expect(result.error).toBeTruthy();
      expect(result.position).toBe(7);
      expect(result.position).not.toBe(0);
    });
});
