/**
 * Tests for scrapeKeywordWithStrategy page-selection logic.
 *
 * Verifies that each strategy scrapes exactly the right pages:
 *  - basic  → page 1 only
 *  - custom → pages 1..N
 *  - smart  → page 1 always, plus the neighbours of the last known page
 *
 * HTTP calls are intercepted via global.fetch so no real network traffic occurs.
 * The serper scraper is used as the test vehicle because its URL clearly exposes
 * the `page` parameter.
 */

import { scrapeKeywordWithStrategy } from '../../utils/scraper';

// serper response stub – valid enough to be accepted by the extractor
const makeSerperResponse = (page: number) => ({
   ok: true,
   status: 200,
   json: async () => ({
      organic: [
         { title: `Result page ${page}`, link: `https://result-${page}.com/`, position: (page - 1) * 10 + 1 },
      ],
   }),
});

const baseKeyword: KeywordType = {
   ID: 1,
   keyword: 'test keyword',
   domain: 'example.com',
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

const baseSettings: SettingsType = {
   scraper_type: 'serper',
   scraping_api: 'test-key',
   scrape_strategy: 'basic',
   scrape_pagination_limit: 5,
   scrape_smart_full_fallback: false,
};

/** Returns the unique page numbers from all fetch calls in ascending order. */
function capturedPages(fetchSpy: jest.SpyInstance): number[] {
   const pages = new Set<number>();
   for (const call of fetchSpy.mock.calls) {
      const url = call[0] as string;
      const match = url.match(/[?&]page=(\d+)/);
      if (match) { pages.add(Number(match[1])); }
   }
   return [...pages].sort((a, b) => a - b);
}

describe('scrapeKeywordWithStrategy – page selection', () => {
   let fetchSpy: jest.SpyInstance;

   beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         return Promise.resolve(makeSerperResponse(page) as unknown as Response);
      });
   });

   afterEach(() => {
      fetchSpy.mockRestore();
   });

   // ── Basic ────────────────────────────────────────────────────────────────

   it('basic: scrapes page 1 only regardless of last position', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'basic' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 45 }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1]);
   });

   // ── Custom ───────────────────────────────────────────────────────────────

   it('custom: scrapes pages 1 through N starting from page 1', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 3 };
      await scrapeKeywordWithStrategy(baseKeyword, settings);
      expect(capturedPages(fetchSpy)).toEqual([1, 2, 3]);
   });

   it('custom: clamps page limit to TOTAL_PAGES (10)', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 99 };
      await scrapeKeywordWithStrategy(baseKeyword, settings);
      expect(capturedPages(fetchSpy).length).toBe(10);
      expect(capturedPages(fetchSpy)[0]).toBe(1);
      expect(capturedPages(fetchSpy)[9]).toBe(10);
   });

   // ── Smart ────────────────────────────────────────────────────────────────

   it('smart: includes page 1 when lastPos is 0 (unranked)', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 0 }, settings);
      expect(capturedPages(fetchSpy)).toContain(1);
   });

   it('smart: scrapes [1, 2] for lastPos=0 (unknown, treated as page 1)', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 0 }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1, 2]);
   });

   it('smart: scrapes [1, 2] for lastPos=5 (page 1)', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 5 }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1, 2]);
   });

   it('smart: scrapes [1, 2, 3] for lastPos=15 (page 2)', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 15 }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1, 2, 3]);
   });

   it('smart: scrapes [1, 2, 3, 4] for lastPos=25 (page 3) – always includes page 1', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 25 }, settings);
      expect(capturedPages(fetchSpy)).toContain(1);
      expect(capturedPages(fetchSpy)).toEqual([1, 2, 3, 4]);
   });

   it('smart: scrapes [1, 9, 10] for lastPos=100 (page 10) – always includes page 1', async () => {
      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      await scrapeKeywordWithStrategy({ ...baseKeyword, position: 100 }, settings);
      expect(capturedPages(fetchSpy)).toContain(1);
      expect(capturedPages(fetchSpy)).toEqual([1, 9, 10]);
   });

   it('smart: page 1 result wins when keyword improved from page 3 to page 1', async () => {
      // keyword last seen at pos 25 (page 3), but actually now at pos 3 (page 1)
      // scrapeSinglePage assigns positions by array index (start + i + 1),
      // so the domain must be the 3rd item (i=2) in the page-1 array to land at position 3.
      fetchSpy.mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         let organic;
         if (page === 1) {
            organic = [
               { title: 'Other 1', link: 'https://other1.com/', position: 1 },
               { title: 'Other 2', link: 'https://other2.com/', position: 2 },
               { title: 'Domain result', link: 'https://example.com/new', position: 3 },
            ];
         } else {
            organic = [{ title: `Other result ${page}`, link: `https://other-${page}.com/`, position: (page - 1) * 10 + 1 }];
         }
         return Promise.resolve({
            ok: true, status: 200,
            json: async () => ({ organic }),
         } as unknown as Response);
      });

      const settings = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, position: 25 }, settings);
      expect(result).not.toBe(false);
      if (result) {
         expect(result.position).toBe(3);
      }
   });
});
