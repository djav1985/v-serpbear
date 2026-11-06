/**
 * Offset-based scrapers continue after the results already returned, so short pages skip nothing.
 */

import { scrapeKeywordWithStrategy } from '../../utils/scraper';

const keyword: KeywordType = {
   ID: 1,
   keyword: 'plumbers',
   domain: 'not-ranked.example',
   device: 'desktop',
   country: 'US',
   position: 0,
   url: '',
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
   scrape_strategy: 'custom',
   scrape_pagination_limit: 3,
} as unknown as SettingsType;

const pageOf = (count: number, label: string) => ({
   success: true,
   data: {
      content: {
         results: Array.from({ length: count }, (_, i) => ({
            type: 'organic', title: `${label}${i}`, url: `https://${label}${i}.example`,
         })),
      },
   },
});

describe('scrapeKeywordWithStrategy with an offset-based scraper', () => {
   it('starts each page after the results already returned', async () => {
      const pages = [pageOf(2, 'a'), pageOf(5, 'b'), pageOf(3, 'c')];
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
         ok: true,
         status: 200,
         text: async () => JSON.stringify(pages.shift()),
      } as unknown as Response));

      const result = (await scrapeKeywordWithStrategy(keyword, settings)) as Exclude<Awaited<ReturnType<typeof scrapeKeywordWithStrategy>>, false>;

      const starts = fetchSpy.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).start);
      expect(starts).toEqual([0, 2, 7]);
      expect(result.result).toHaveLength(10);
      fetchSpy.mockRestore();
   });
});
