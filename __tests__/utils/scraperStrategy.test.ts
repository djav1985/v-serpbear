/**
 * Tests for scrapeKeywordWithStrategy page-selection and position-assignment logic.
 *
 * Verifies that each strategy scrapes exactly the right pages:
 *  - basic  → page 1 only
 *  - custom → pages 1..N
 *  - smart  → page 1 always, plus the neighbours of the last known page
 *
 * Also verifies that positions are computed correctly even when:
 *  - a page returns fewer than PAGE_SIZE results (variable page sizes)
 *  - the API restarts position numbering at 1 for every page
 *
 * HTTP calls are intercepted via global.fetch so no real network traffic occurs.
 * The serper scraper is used as the test vehicle because its URL clearly exposes
 * the `page` parameter.
 */

import { scrapeKeywordWithStrategy } from '../../utils/scraper';

// serper response stub – one result per page, valid enough for the extractor
const makeSerperResponse = (page: number) => ({
   ok: true,
   status: 200,
   json: async () => ({
      organic: [
         { title: `Result page ${page}`, link: `https://result-${page}.com/`, position: (page - 1) * 10 + 1 },
      ],
   }),
});

// Multi-result serper response – N items, all reporting position starting at 1 (as
// some APIs do for every page).  The implementation must ignore the item.position
// field and use the array index instead.
const makeSerperResponseN = (page: number, count: number, domainIncludes?: string) => ({
   ok: true,
   status: 200,
   json: async () => ({
      organic: Array.from({ length: count }, (_, i) => ({
         title: domainIncludes && i === 0 ? `${domainIncludes} title` : `Other ${page}-${i}`,
         link: domainIncludes && i === 0 ? `https://${domainIncludes}/p${page}` : `https://other-${page}-${i}.com/`,
         position: i + 1, // page-relative – APIs commonly restart at 1 for every page
      })),
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

   it('custom: stops early when keyword is found on page 1 (does not scrape remaining pages)', async () => {
      // page 1 contains the domain → should stop after page 1, never request pages 2..5
      fetchSpy.mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         return Promise.resolve(makeSerperResponseN(page, 10, page === 1 ? 'example.com' : undefined) as unknown as Response);
      });

      const settings = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 5 };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1]);
      if (result) {
         expect(result.position).toBe(1);
      }
   });

   it('custom: continues to page 2 when keyword is not found on page 1', async () => {
      // page 1 has no domain result; domain appears on page 2 → should scrape both pages
      fetchSpy.mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         return Promise.resolve(makeSerperResponseN(page, 10, page === 2 ? 'example.com' : undefined) as unknown as Response);
      });

      const settings = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 5 };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, settings);
      expect(capturedPages(fetchSpy)).toEqual([1, 2]);
      if (result) {
         expect(result.position).toBe(11);
      }
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
      // keyword last seen at pos 25 (page 3), but actually now at pos 3 (page 1).
      // scrapeSinglePage returns page-relative positions (1..N based on index);
      // the cumulative offset is applied by scrapeKeywordWithStrategy.
      // The domain is the 3rd item (i=2) on page 1: cumulativeOffset=0, position=0+3=3.
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

// ── Position accuracy with variable page sizes ───────────────────────────────

describe('scrapeKeywordWithStrategy – position accuracy', () => {
   let fetchSpy: jest.SpyInstance;

   afterEach(() => {
      fetchSpy.mockRestore();
   });

   it('consecutive pages: domain on page 2 at index 0 → absolute position 11 when page 1 returned 10 results', async () => {
      // page 1: 10 results, page 2: domain is first item (index 0)
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         const response = page === 2
            ? makeSerperResponseN(2, 10, 'example.com')
            : makeSerperResponseN(1, 10);
         return Promise.resolve(response as unknown as Response);
      });

      const settings: SettingsType = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 2 };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, settings);
      expect(result).not.toBe(false);
      if (result) {
         // page 1 = 10 results → offset 10; domain is first on page 2 (index 0, relative pos 1) → 11
         expect(result.position).toBe(11);
      }
   });

   it('variable page size: domain on page 2 at index 0 → absolute position 8 when page 1 returned only 7 results', async () => {
      // page 1: 7 results, page 2: domain is first item (index 0).
      // cumulativeOffset after page 1 = 7; domain at index 0 on page 2 → 7+1 = 8.
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         const response = page === 2
            ? makeSerperResponseN(2, 10, 'example.com')
            : makeSerperResponseN(1, 7); // only 7 results on page 1
         return Promise.resolve(response as unknown as Response);
      });

      const settings: SettingsType = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 2 };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, settings);
      expect(result).not.toBe(false);
      if (result) {
         // cumulativeOffset after page 1 = 7; domain at index 0 on page 2 → position 7+1 = 8
         expect(result.position).toBe(8);
      }
   });

   it('API position restart at 1: positions are assigned by index, not by what the API reports', async () => {
      // Both pages report positions 1..N in the response — simulate an API that restarts
      // numbering at 1 per page.  The implementation must use the array index.
      // page 1: 10 results; page 2: domain is third item (index 2, API says position 3)
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         if (page === 2) {
            return Promise.resolve({
               ok: true, status: 200,
               json: async () => ({
                  organic: [
                     { title: 'Other 2-0', link: 'https://other.com/a', position: 1 }, // API says 1 (page-relative)
                     { title: 'Other 2-1', link: 'https://other.com/b', position: 2 },
                     { title: 'Domain', link: 'https://example.com/page2', position: 3 }, // API says 3, should be 13
                  ],
               }),
            } as unknown as Response);
         }
         return Promise.resolve(makeSerperResponseN(1, 10) as unknown as Response);
      });

      const settings: SettingsType = { ...baseSettings, scrape_strategy: 'custom' as ScrapeStrategy, scrape_pagination_limit: 2 };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, settings);
      expect(result).not.toBe(false);
      if (result) {
         // offset after page 1 = 10; domain is at index 2 on page 2 → position 10+3 = 13
         expect(result.position).toBe(13);
      }
   });

   it('smart non-contiguous: domain on page 9 → gap-estimated offset preserves correct page-9 position range', async () => {
      // keyword last known at pos 100 (page 10), smart scrapes [1, 9, 10].
      // page 1: 10 results; pages 9 and 10 both have 10 results; domain is first on page 9.
      // Gap from page 1 to page 9 = 7 pages × PAGE_SIZE(10) = 70, offset = 10+70 = 80.
      // Domain at index 0 on page 9 → absolute position 81.
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
         const pageMatch = String(url).match(/[?&]page=(\d+)/);
         const page = pageMatch ? Number(pageMatch[1]) : 1;
         if (page === 9) {
            return Promise.resolve({
               ok: true, status: 200,
               json: async () => ({
                  organic: [
                     { title: 'Domain', link: 'https://example.com/p9', position: 1 },
                     ...Array.from({ length: 9 }, (_, i) => ({ title: `Other 9-${i}`, link: `https://other9-${i}.com/`, position: i + 2 })),
                  ],
               }),
            } as unknown as Response);
         }
         return Promise.resolve(makeSerperResponseN(page, 10) as unknown as Response);
      });

      const settings: SettingsType = { ...baseSettings, scrape_strategy: 'smart' as ScrapeStrategy };
      const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com', position: 100 }, settings);
      expect(result).not.toBe(false);
      if (result) {
         expect(result.position).toBe(81);
      }
   });
});

