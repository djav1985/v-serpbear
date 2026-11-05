/**
 * Page 1 with a map pack but no organic results: position 0 and the map pack is still updated.
 */

import { scrapeKeywordWithStrategy } from '../../utils/scraper';

const keyword: KeywordType = {
   ID: 1,
   keyword: 'port charlotte affordable website design',
   domain: 'vontainment.com',
   device: 'desktop',
   country: 'US',
   position: 7,
   url: 'https://vontainment.com/',
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

const settings = {
   scraper_type: 'prismcrawl',
   scraping_api: 'test-key',
   scrape_strategy: 'basic',
   scrape_pagination_limit: 5,
   business_name: 'Vontainment',
} as unknown as SettingsType;

const payload = {
   success: true,
   data: {
      content: {
         results: [],
         serp_features: [{
            type: 'local_results',
            items: [{ title: 'CeJay Websites' }, { title: 'Vontainment' }],
         }],
      },
   },
};

describe('scrapeKeywordWithStrategy with local results but no organic results on page 1', () => {
   let fetchSpy: jest.SpyInstance;

   beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         ok: true,
         status: 200,
         text: async () => JSON.stringify(payload),
      } as unknown as Response);
   });

   afterEach(() => {
      fetchSpy.mockRestore();
   });

   it('sets position to 0 and updates the map pack', async () => {
      const result = (await scrapeKeywordWithStrategy(keyword, settings)) as Exclude<Awaited<ReturnType<typeof scrapeKeywordWithStrategy>>, false>;

      expect(result.error).toBe(false);
      expect(result.position).toBe(0);
      expect(result.mapPackTop3).toBe(true);
      expect(result.localResults).toHaveLength(2);
   });
});
