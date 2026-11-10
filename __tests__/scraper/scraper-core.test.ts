import { serializeError } from '../../utils/errorSerialization';
import { getScraperClient, getSerp, parseScraperResponse, scrapeKeywordWithStrategy } from '../../utils/scraper';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import countries from '../../utils/countries';
import dataforseo from '../../scrapers/services/dataforseo';
import crazyserp from '../../scrapers/services/crazyserp';
import { isGoogleRedirectUrl, resolveGoogleRedirects } from '../../utils/resolveGoogleLinks';
import { logger } from '../../utils/logger';
import { computeMapPackTop3, markOwnLocalResults } from '../../utils/mapPack';

jest.mock('../../utils/logger', () => ({
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('scraper', () => {
  describe('resolveCountryCode', () => {
    it('returns the country when no allowed countries array (or an empty one) is provided', () => {
      expect(resolveCountryCode('CA')).toBe('CA');
      expect(resolveCountryCode('DE')).toBe('DE');
      expect(resolveCountryCode('CA', [])).toBe('CA');
      expect(resolveCountryCode('DE', [])).toBe('DE');
    });

    it('returns fallback when country is empty, undefined, or not in the allowed countries array', () => {
      expect(resolveCountryCode('')).toBe('US');
      expect(resolveCountryCode(undefined as any)).toBe('US');
      expect(resolveCountryCode('', ['CA', 'US'])).toBe('US');

      const allowedCountries = ['US', 'CA', 'GB', 'DE'];
      expect(resolveCountryCode('FR', allowedCountries)).toBe('US');
      expect(resolveCountryCode('ZZ', allowedCountries)).toBe('US');
    });

    it('returns country when it exists in allowed countries array', () => {
      const allowedCountries = ['US', 'CA', 'GB', 'DE'];
      expect(resolveCountryCode('CA', allowedCountries)).toBe('CA');
      expect(resolveCountryCode('ca', allowedCountries)).toBe('CA'); // normalized to uppercase
      expect(resolveCountryCode('GB', allowedCountries)).toBe('GB');
    });

    it('supports custom fallback country', () => {
      const allowedCountries = ['CA', 'GB', 'DE'];
      expect(resolveCountryCode('FR', allowedCountries, 'CA')).toBe('CA');
      expect(resolveCountryCode('', allowedCountries, 'GB')).toBe('GB');
    });

    it('returns uppercase codes that work with the countries object lookup', () => {
      expect(resolveCountryCode('us')).toBe('US');
      expect(resolveCountryCode('US')).toBe('US');
      expect(resolveCountryCode('Ca')).toBe('CA');

      const country = resolveCountryCode('de');
      expect(country).toBe('DE');
      expect(countries[country]).toBeDefined();
      expect(countries[country][0]).toBe('Germany');

      const frCountry = resolveCountryCode('fr');
      expect(frCountry).toBe('FR');
      expect(countries[frCountry]).toBeDefined();

      const gbCountry = resolveCountryCode('gb');
      expect(gbCountry).toBe('GB');
      expect(countries[gbCountry]).toBeDefined();
    });

    it('falls back to first valid allowed country when fallback is not permitted', () => {
      expect(resolveCountryCode('zz', ['DE', 'FR'], 'BR')).toBe('DE');
    });
  });

  describe('serializeError', () => {
    it('prefixes status codes and flattens nested request info', () => {
      const errorObject = {
        status: 400,
        error: 'API rate limit exceeded',
        request_info: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
          },
        },
      };

      const result = serializeError(errorObject);
      expect(result).toContain('[400]');
      expect(result).toContain('API rate limit exceeded');
      expect(result).toContain('Too many requests');
    });

    it('preserves error messages from native Error instances and their causes', () => {
      const rootError = new Error('Network unreachable');
      const wrappedError = new Error('Failed to refresh keyword');
      (wrappedError as Error & { cause?: unknown }).cause = rootError;

      const result = serializeError(wrappedError);
      expect(result).toContain('Failed to refresh keyword');
      expect(result).toContain('Network unreachable');
    });

    it('falls back to JSON for plain objects without readable properties', () => {
      const payload = { meta: { attempt: 1 } };
      const result = serializeError(payload);
      expect(result).toBe(JSON.stringify(payload));
    });

    it('returns a stable fallback for circular structures', () => {
      const circular: any = { prop: 'value' };
      circular.self = circular;
      const result = serializeError(circular);
      expect(result).toBe('Unserializable error object');
    });

    it('returns Unknown error for nullish values and empty strings', () => {
      expect(serializeError(null)).toBe('Unknown error');
      expect(serializeError(undefined)).toBe('Unknown error');
      expect(serializeError('')).toBe('Unknown error');
    });

    it('stringifies primitive values safely and returns readable strings unchanged', () => {
      expect(serializeError(404)).toBe('404');
      expect(serializeError(true)).toBe('true');

      const message = 'Simple error message';
      expect(serializeError(message)).toBe(message);
    });
  });

  describe('getSerp', () => {
    it('returns the highest-ranking (lowest position number) match when the domain appears on multiple pages', () => {
      const results: Array<{ title: string; url: string; position: number }> = [
        { position: 45, url: 'https://example.com/page-a', title: '' }, // from page 5, scraped first
        { position: 50, url: 'https://other.com/x', title: '' },
        { position: 15, url: 'https://example.com/page-b', title: '' }, // from page 2, scraped later
        { position: 20, url: 'https://other.com/y', title: '' },
      ];
      const serp = getSerp('example.com', results);
      expect(serp.position).toBe(15);
      expect(serp.url).toBe('https://example.com/page-b');
    });

    it('returns position 0 when no match is found', () => {
      const results: Array<{ title: string; url: string; position: number }> = [
        { position: 1, url: 'https://other.com/a', title: '' },
        { position: 2, url: 'https://another.com/b', title: '' },
      ];
      const serp = getSerp('example.com', results);
      expect(serp.position).toBe(0);
      expect(serp.url).toBe('');
    });

    it('matches domains when only www prefix differs', () => {
      const results: Array<{ title: string; url: string; position: number }> = [
        { position: 1, url: 'https://www.example.com/a', title: '' },
      ];
      const serp = getSerp('example.com', results);
      expect(serp.position).toBe(1);
    });
  });
});

describe('body reading', () => {
  const responseWithText = (status: number, text: string) => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
    json: async () => { throw new Error('json() should not be used'); },
  }) as unknown as Response;

  describe('parseScraperResponse', () => {
    it('parses a JSON body and fills in status and ok when the provider omits them', async () => {
      const parsed = await parseScraperResponse(responseWithText(200, '{"organic_results":[]}'));

      expect(parsed).toEqual({ organic_results: [], status: 200, ok: true });
    });

    it('keeps a non-JSON error body so the error message can show what the server said', async () => {
      const parsed = await parseScraperResponse(responseWithText(502, '<html>Bad gateway from upstream</html>'));

      expect(parsed).toEqual({ status: 502, ok: false, body: '<html>Bad gateway from upstream</html>' });
    });

    it('limits how much of a non-JSON body is kept', async () => {
      const parsed = await parseScraperResponse(responseWithText(500, 'x'.repeat(2000)));

      expect((parsed as { body: string }).body).toHaveLength(500);
    });

    it('fails instead of hanging when the body stalls', async () => {
      jest.useFakeTimers();
      try {
        const stalled = { status: 200, ok: true, text: () => new Promise<string>(() => {}) } as unknown as Response;

        const pending = parseScraperResponse(stalled);
        const assertion = expect(pending).rejects.toThrow('timed out');
        await jest.advanceTimersByTimeAsync(30000);

        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('scraper request cancellation', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
      jest.useRealTimers();
    });

    it('aborts the request when reading its body times out, so the connection is released', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      const response = { status: 200, ok: true, text: () => new Promise<string>(() => {}) } as unknown as Response;
      global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
        signal = init?.signal as AbortSignal;
        return Promise.resolve(response);
      }) as unknown as typeof fetch;
      const scraper = { id: 'test', name: 'Test', scrapeURL: () => 'https://example.test/search', resultObjectKey: 'results' } as any;

      const client = getScraperClient({ keyword: 'a', device: 'desktop', country: 'US' } as any, {} as any, scraper);
      const received = (await client) as Response;
      expect(signal?.aborted).toBe(false);

      const pending = parseScraperResponse(received);
      const assertion = expect(pending).rejects.toThrow('timed out');
      await jest.advanceTimersByTimeAsync(30000);
      await assertion;

      expect(signal?.aborted).toBe(true);
    });
  });

  describe('DataForSEO extractor pagination', () => {
    const serpItems = [
      { type: 'paid', title: 'Ad 1', url: 'https://ad-1.com/' },
      { type: 'paid', title: 'Ad 2', url: 'https://ad-2.com/' },
      { type: 'organic', title: 'R1', url: 'https://r1.com/', rank_absolute: 3 },
      { type: 'organic', title: 'R2', url: 'https://r2.com/', rank_absolute: 4 },
      { type: 'organic', title: 'R3', url: 'https://r3.com/', rank_absolute: 5 },
      { type: 'organic', title: 'R4', url: 'https://r4.com/', rank_absolute: 6 },
      { type: 'organic', title: 'R5', url: 'https://r5.com/', rank_absolute: 7 },
      { type: 'organic', title: 'R6', url: 'https://r6.com/', rank_absolute: 8 },
      { type: 'organic', title: 'R7', url: 'https://r7.com/', rank_absolute: 9 },
      { type: 'organic', title: 'R8', url: 'https://r8.com/', rank_absolute: 10 },
      { type: 'organic', title: 'R9', url: 'https://r9.com/', rank_absolute: 11 },
      { type: 'organic', title: 'R10', url: 'https://r10.com/', rank_absolute: 12 },
      { type: 'organic', title: 'R11', url: 'https://r11.com/', rank_absolute: 13 },
    ];
    const response = { tasks: [{ status_code: 20000, result: [{ items: serpItems }] }] };
    const keyword = { keyword: 'coffee', domain: 'r9.com', country: 'US', device: 'desktop' } as any;

    it('returns only the ranks in the requested page, counting ads in the rank', () => {
      const { organic } = dataforseo.serpExtractor!({
        keyword,
        response,
        result: undefined,
        settings: {} as any,
        pagination: { start: 0, num: 10, page: 1 },
      } as any);

      expect(organic.map((item) => item.position)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('returns the next page by absolute rank instead of slicing the organic list', () => {
      const { organic } = dataforseo.serpExtractor!({
        keyword,
        response,
        result: undefined,
        settings: {} as any,
        pagination: { start: 10, num: 10, page: 2 },
      } as any);

      expect(organic.map((item) => item.position)).toEqual([11, 12, 13]);
    });
  });

  describe('CrazySERP extractor', () => {
    it('does not throw when the payload is an object without an organic list', () => {
      const extract = () => crazyserp.serpExtractor!({
        keyword: {} as any,
        response: {},
        result: JSON.stringify({ message: 'no results' }),
        settings: {} as any,
      } as any);

      expect(extract()).toEqual({ organic: [], mapPackTop3: false, localResults: [] });
    });

    it('reads the organic list from an object payload', () => {
      const { organic } = crazyserp.serpExtractor!({
        keyword: {} as any,
        response: {},
        result: JSON.stringify({ organic: [{ title: 'A', url: 'https://a.com/', position: 1 }] }),
        settings: {} as any,
      } as any);

      expect(organic).toEqual([{ title: 'A', url: 'https://a.com/', position: 1 }]);
    });
  });
});

describe('strategy', () => {
  /**
   * Tests for scrapeKeywordWithStrategy page-selection and position-assignment logic.
   *
   * Verifies that each strategy scrapes exactly the right pages:
   *  - basic  → page 1 only
   *  - custom → pages 1..N
   *
   * Also verifies that positions are computed correctly even when:
   *  - a page returns fewer than PAGE_SIZE results (variable page sizes)
   *  - the API restarts position numbering at 1 for every page
   *
   * HTTP calls are intercepted via global.fetch so no real network traffic occurs.
   * The serper scraper is used as the test vehicle because its URL clearly exposes
   * the `page` parameter.
   */


  // serper response stub – one result per page, valid enough for the extractor
  const makeSerperResponse = (page: number) => ({
     ok: true,
     status: 200,
     text: async function () { return JSON.stringify(await this.json()); },
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
     text: async function () { return JSON.stringify(await this.json()); },
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

  const baseSettings = {
     scraper_type: 'serper',
     scraping_api: 'test-key',
     scrape_strategy: 'basic',
     scrape_pagination_limit: 5,
  } as unknown as SettingsType;

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

     it('basic (and a leftover smart strategy, treated as basic): scrapes page 1 only regardless of last position', async () => {
        for (const strategy of ['basic', 'smart'] as const) {
           fetchSpy.mockClear();
           const settings = { ...baseSettings, scrape_strategy: strategy as unknown as ScrapeStrategy };
           await scrapeKeywordWithStrategy({ ...baseKeyword, position: 45 }, settings);
           expect({ strategy, pages: capturedPages(fetchSpy) }).toEqual({ strategy, pages: [1] });
        }
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
                 text: async function (this: { json: () => Promise<unknown> }) { return JSON.stringify(await this.json()); },
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
  });

  describe('scrapeKeywordWithStrategy – DataForSEO per-page depth', () => {
     let fetchSpy: jest.SpyInstance;

     // DataForSEO returns organic items for the requested depth, up to 25 in this stub.
     const makeDataForSeoResponse = (depth: number) => ({
        ok: true,
        status: 200,
        text: async function () { return JSON.stringify(await this.json()); },
        json: async () => ({
           tasks: [{
              status_code: 20000,
              result: [{
                 items: Array.from({ length: Math.min(depth, 25) }, (_, i) => ({
                    type: 'organic',
                    title: i === 14 ? 'example.com title' : `Other ${i + 1}`,
                    url: i === 14 ? 'https://example.com/' : `https://other-${i + 1}.com/`,
                    rank_absolute: i + 1,
                 })),
              }],
           }],
        }),
     });

     beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
           const body = JSON.parse(String(init?.body ?? '[]'));
           return Promise.resolve(makeDataForSeoResponse(body[0].depth) as unknown as Response);
        });
     });

     afterEach(() => {
        fetchSpy.mockRestore();
     });

     const dataForSeoSettings = {
        ...baseSettings,
        scraper_type: 'dataforseo',
        scraping_api: 'login:password',
        scrape_strategy: 'custom' as ScrapeStrategy,
        scrape_pagination_limit: 3,
     } as unknown as SettingsType;

     const requestedDepths = () => fetchSpy.mock.calls.map((call) => JSON.parse(String(call[1]?.body))[0].depth);

     it('custom: requests each planned page at the depth that page ends on', async () => {
        await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'nomatch.com' }, dataForSeoSettings);
        expect(requestedDepths()).toEqual([10, 20, 30]);
     });

     it('custom: stops at the page where the domain is found and reports its absolute position', async () => {
        const result = await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'example.com' }, dataForSeoSettings);

        expect(requestedDepths()).toEqual([10, 20]);
        expect(result).not.toBe(false);
        if (result) {
           expect(result.position).toBe(15);
        }
     });

     it('basic: requests only page 1 depth (10 results)', async () => {
        await scrapeKeywordWithStrategy({ ...baseKeyword, domain: 'nomatch.com' }, { ...dataForSeoSettings, scrape_strategy: 'basic' as ScrapeStrategy });

        const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(body[0].depth).toBe(10);
     });
  });


  describe('scrapeKeywordWithStrategy – JSON null response', () => {
     it('returns a provider error instead of throwing a TypeError', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve({
           ok: true,
           status: 200,
           text: async () => 'null',
        } as unknown as Response));
        try {
           const result: any = await scrapeKeywordWithStrategy(baseKeyword, baseSettings);
           expect(result.error).toContain('empty or invalid response');
        } finally {
           fetchSpy.mockRestore();
        }
     });
  });
});

describe('local-only page', () => {
  /**
   * Page 1 with a map pack but no organic results: position 0 and the map pack is still updated.
   */


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
});

describe('offset pagination', () => {
  /**
   * Offset-based scrapers continue after the results already returned, so short pages skip nothing.
   */


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
     afterEach(() => {
        jest.restoreAllMocks();
     });

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
     });
  });
});

describe('failure keeps position', () => {
  /**
   * A keyword whose scrape request keeps failing (e.g. "This operation was aborted") must come back
   * as an error with its previous position, not as position 0.
   */


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
     beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(global, 'fetch').mockImplementation(() => {
           const err = new Error('This operation was aborted');
           err.name = 'AbortError';
           return Promise.reject(err);
        });
     });

     afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
     });

     it('returns an error and keeps the previous position instead of 0', async () => {
        const pending = scrapeKeywordWithStrategy(keywordAtPosition7, serperSettings);
        await jest.runAllTimersAsync();
        const result = (await pending) as Exclude<Awaited<typeof pending>, false>;

        expect(result.error).toBe('This operation was aborted');
        expect(result.position).toBe(7);
        expect(result.position).not.toBe(0);
      });
  });
});

describe('google links', () => {
  const GOTO_A = 'https://www.google.com/goto?url=CAESaaa';
  const GOTO_B = 'https://www.google.com/goto?url=CAESbbb';

  const jsonResponse = (body: unknown, status = 200) => ({
     ok: status >= 200 && status < 300,
     status,
     json: async () => body,
  }) as unknown as Response;

  describe('isGoogleRedirectUrl', () => {
     it('recognises Google goto and url redirect links', () => {
        expect(isGoogleRedirectUrl(GOTO_A)).toBe(true);
        expect(isGoogleRedirectUrl('https://www.google.co.uk/url?q=https://example.com/')).toBe(true);
     });

     it('ignores everything else', () => {
        expect(isGoogleRedirectUrl('https://example.com/goto?url=abc')).toBe(false);
        expect(isGoogleRedirectUrl('https://www.google.com/search?q=x')).toBe(false);
        expect(isGoogleRedirectUrl('not a url')).toBe(false);
        expect(isGoogleRedirectUrl(undefined)).toBe(false);
     });
  });

  describe('resolveGoogleRedirects', () => {
     let fetchSpy: jest.SpyInstance;

     beforeEach(() => {
        jest.clearAllMocks();
        fetchSpy = jest.spyOn(global, 'fetch');
     });

     afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
     });

     it('sends only the Google redirect links to Serper with the key, and swaps in the real addresses in order', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ title: 'B', link: 'https://b.example/page' }, { title: 'C', link: 'https://c.example/' }] }));
        const items = [
           { title: 'A', url: 'https://a.example/', position: 1 },
           { title: 'B', url: GOTO_A, position: 2 },
           { title: 'C', url: GOTO_B, position: 3 },
        ];

        const out = await resolveGoogleRedirects(items, 'secret-key');

        expect(out.map((item) => item.url)).toEqual(['https://a.example/', 'https://b.example/page', 'https://c.example/']);
        expect(out.map((item) => item.position)).toEqual([1, 2, 3]);
        expect(items[1].url).toBe(GOTO_A);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://google.serper.dev/resolve');
        expect(init.method).toBe('POST');
        expect(init.headers['X-API-KEY']).toBe('secret-key');
        expect(JSON.parse(init.body)).toEqual({ organic: [{ title: 'B', link: GOTO_A }, { title: 'C', link: GOTO_B }] });
     });

     it('does nothing without a key or without Google links', async () => {
        const items = [{ title: 'A', url: GOTO_A }];
        expect(await resolveGoogleRedirects(items, '')).toBe(items);
        expect(await resolveGoogleRedirects([{ title: 'A', url: 'https://a.example/' }], 'key')).toHaveLength(1);
        expect(fetchSpy).not.toHaveBeenCalled();
     });

     it('sends unresolved links once more after waiting retryAfter seconds, and keeps the Google link if still unresolved', async () => {
        jest.useFakeTimers();
        fetchSpy
           .mockResolvedValueOnce(jsonResponse({ organic: [{ link: 'https://a.example/' }, { link: GOTO_B }], retryAfter: 20 }))
           .mockResolvedValueOnce(jsonResponse({ organic: [{ link: GOTO_B }] }));

        const promise = resolveGoogleRedirects([{ title: 'A', url: GOTO_A }, { title: 'B', url: GOTO_B }], 'key');
        await jest.advanceTimersByTimeAsync(19000);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(1000);
        const out = await promise;

        expect(out.map((item) => item.url)).toEqual(['https://a.example/', GOTO_B]);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({ organic: [{ title: 'B', link: GOTO_B }] });
        expect(logger.warn).toHaveBeenCalledWith('[SCRAPE] Google links left unresolved', { unresolved: 1, total: 2 });
     });

     it('uses a 30 second timeout per call', async () => {
        const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
        fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ link: 'https://a.example/' }] }));
        await resolveGoogleRedirects([{ title: 'A', url: GOTO_A }], 'key');
        expect(timeoutSpy).toHaveBeenCalledWith(30000);
     });

     it('tries a timed out call once more, then gives up without throwing', async () => {
        const items = [{ title: 'A', url: GOTO_A }];
        fetchSpy.mockRejectedValue(new Error('timeout'));
        await expect(resolveGoogleRedirects(items, 'key')).resolves.toEqual(items);
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        fetchSpy.mockReset();
        fetchSpy.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(jsonResponse({ organic: [{ link: 'https://a.example/' }] }));
        expect((await resolveGoogleRedirects(items, 'key'))[0].url).toBe('https://a.example/');
     });

     it.each([
        ['an HTTP error', () => fetchSpy.mockResolvedValue(jsonResponse({}, 401))],
        ['a response with the wrong shape', () => fetchSpy.mockResolvedValue(jsonResponse({ organic: [] }))],
        ['an unreadable response', () => fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } } as unknown as Response)],
     ])('leaves the links unchanged on %s, tries once more, and never throws', async (_name, arrange) => {
        arrange();
        const items = [{ title: 'A', url: GOTO_A }];

        await expect(resolveGoogleRedirects(items, 'key')).resolves.toEqual(items);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalled();
     });

     it('does not accept a Google link as the answer, and tries once more', async () => {
        fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ link: 'https://www.google.com/goto?url=CAESstill' }] }));
        const items = [{ title: 'A', url: GOTO_A }];

        expect(await resolveGoogleRedirects(items, 'key')).toEqual(items);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
     });
  });
});

describe('map pack own result', () => {
  describe('markOwnLocalResults', () => {
     const results = [
        { position: 1, title: 'CeJay Websites' },
        { position: 2, title: 'Vontainment' },
        { position: 3, title: 'US Web Central' },
        { position: 4, title: 'Vontainment' },
     ];

     it('marks only the top-3 entry whose title equals the business name, ignoring case and spaces', () => {
        const out = markOwnLocalResults(results, '  vontainment ');
        expect(out.map((entry) => entry.isOwn)).toEqual([false, true, false, false]);
     });

     it('matches business names regardless of accents', () => {
        const listed = [{ position: 1, title: 'Café Crème' }, { position: 2, title: 'Other' }];
        expect(markOwnLocalResults(listed, 'Cafe Creme')[0].isOwn).toBe(true);
        expect(markOwnLocalResults([{ position: 1, title: 'Cafe Creme' }], 'Café Crème')[0].isOwn).toBe(true);
     });

     it('still matches when only spacing, punctuation or "&" differ', () => {
        const listed = [
           { position: 1, title: 'Smith &  Sons, Inc.' },
           { position: 2, title: 'Other' },
        ];
        expect(markOwnLocalResults(listed, 'smith and sons inc')[0].isOwn).toBe(true);
        expect(markOwnLocalResults(listed, "Smith & Sons Inc")[0].isOwn).toBe(true);
        expect(computeMapPackTop3(listed, 'Smith and Sons, Inc')).toBe(true);
        expect(markOwnLocalResults(listed, 'Smith Sons')[0].isOwn).toBe(false);
     });

     it('marks nothing without a business name, and copes with missing lists', () => {
        expect(markOwnLocalResults(results, '').every((entry) => entry.isOwn === false)).toBe(true);
        expect(markOwnLocalResults(results, null).every((entry) => entry.isOwn === false)).toBe(true);
        expect(markOwnLocalResults(undefined, 'Vontainment')).toEqual([]);
     });


     it('does not change the original entries', () => {
        markOwnLocalResults(results, 'Vontainment');
        expect(results[1]).toEqual({ position: 2, title: 'Vontainment' });
     });
  });
});
