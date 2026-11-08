import crazyserp from '../scrapers/services/crazyserp';
import prismcrawl from '../scrapers/services/prismcrawl';
import { getScraperClient } from '../utils/scraper';
import dataforseo from '../scrapers/services/dataforseo';
import serpbase from '../scrapers/services/serpbase';
import valueSerp from '../scrapers/services/valueserp';
import hasdata from '../scrapers/services/hasdata';
import serper from '../scrapers/services/serper';
import serpapi from '../scrapers/services/serpapi';
import serply from '../scrapers/services/serply';
import searchapi from '../scrapers/services/searchapi';
import { runScraperURLContracts } from './__helpers__/scraperContract';
import { computeMapPackTop3 } from '../utils/mapPack';

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('crazyserp', () => {
  describe('crazyserp scraper', () => {
     const settings: Partial<SettingsType> = { scraping_api: 'crazyserp-key' };
     const countryData = {
        US: ['United States', 'Washington, D.C.', 'en', 2840],
        DE: ['Germany', 'Berlin', 'de', 2921],
        GB: ['United Kingdom', 'London', 'en', 2635],
     } as any;

     describe('scrapeURL', () => {
        it('builds a valid API URL with locale and device params', () => {
           const keyword: Partial<KeywordType> = {
              keyword: 'best coffee shops',
              country: 'US',
              device: 'desktop',
           };

           const url = crazyserp.scrapeURL!(
              keyword as KeywordType,
              settings as SettingsType,
              countryData
           );
           const parsed = new URL(url);

           expect(parsed.origin).toBe('https://crazyserp.com');
           expect(parsed.pathname).toBe('/api/search');
           expect(parsed.searchParams.get('q')).toBe('best coffee shops');
           expect(parsed.searchParams.get('gl')).toBe('us');
           expect(parsed.searchParams.get('hl')).toBe('en');
           expect(parsed.searchParams.get('device')).toBe('desktop');
           expect(parsed.searchParams.get('googleDomain')).toBe('google.com');
        });

        it('uses country-specific Google domain for known countries', () => {
           const keyword: Partial<KeywordType> = {
              keyword: 'coffee',
              country: 'GB',
              device: 'desktop',
           };

           const url = crazyserp.scrapeURL!(
              keyword as KeywordType,
              settings as SettingsType,
              countryData
           );
           const parsed = new URL(url);

           expect(parsed.searchParams.get('gl')).toBe('gb');
           expect(parsed.searchParams.get('hl')).toBe('en');
           expect(parsed.searchParams.get('googleDomain')).toBe('google.co.uk');
        });

        it('sends the stored keyword.location as-is, and omits location for a blank country-only keyword', () => {
           const withLocation: Partial<KeywordType> = {
              keyword: 'plumber',
              country: 'US',
              location: 'Austin,TX,United States',
              device: 'desktop',
           };
           const countryOnly: Partial<KeywordType> = {
              keyword: 'seo tools',
              country: 'DE',
              device: 'desktop',
           };

           const parsed = new URL(crazyserp.scrapeURL!(
              withLocation as KeywordType,
              settings as SettingsType,
              countryData
           ));
           expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');

           const countryParsed = new URL(crazyserp.scrapeURL!(
              countryOnly as KeywordType,
              settings as SettingsType,
              countryData
           ));
           expect(countryParsed.searchParams.has('location')).toBe(false);
           expect(countryParsed.searchParams.get('gl')).toBe('de');
           expect(countryParsed.searchParams.get('hl')).toBe('de');
        });

        it('maps the 0-based page index to pageOffset, always fetches one page, and defaults to page=1/pageOffset=0 without pagination', () => {
           const keyword: Partial<KeywordType> = {
              keyword: 'coffee',
              country: 'US',
              device: 'desktop',
           };
           const pagination: ScraperPagination = { start: 20, num: 10, page: 3 };

           const paged = new URL(crazyserp.scrapeURL!(
              keyword as KeywordType,
              settings as SettingsType,
              countryData,
              pagination
           ));
           // page 3 of results is pageOffset 2 (0-based), and only that one page is requested
           expect(paged.searchParams.get('page')).toBe('1');
           expect(paged.searchParams.get('pageOffset')).toBe('2');

           const unpaged = new URL(crazyserp.scrapeURL!(
              keyword as KeywordType,
              settings as SettingsType,
              countryData
           ));
           expect(unpaged.searchParams.get('page')).toBe('1');
           expect(unpaged.searchParams.get('pageOffset')).toBe('0');
        });
     });

     describe('serpExtractor', () => {
        const baseKeyword: KeywordType = {
           ID: 1,
           keyword: 'coffee',
           country: 'US',
           domain: 'example.com',
           device: 'desktop',
           lastUpdated: '',
           volume: 0,
           added: '',
           position: 0,
           sticky: false,
           history: {},
           lastResult: [],
           url: '',
           tags: [],
           updating: false,
           lastUpdateError: false,
           mapPackTop3: false,
           location: '',
        };

        describe('map pack from locations', () => {
           const locations = [
              { title: 'CeJay Websites', website_url: 'https://cejaywebsites.com/', rating: 5 },
              { title: 'Vontainment', website_url: 'https://vontainment.com/' },
              { title: 'No Site' },
           ];

           it('reads the documented payload shape, where the scraper passes parsed_data as the result', () => {
              const response = {
                 success: true,
                 parsed_data: {
                    has_map: true,
                    organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }],
                    locations,
                 },
              };

              const extraction = crazyserp.serpExtractor!({
                 keyword: baseKeyword,
                 response,
                 result: response.parsed_data,
                 settings: { business_name: 'Vontainment' } as any,
              } as any);

              expect(extraction.organic).toHaveLength(1);
              expect(extraction.mapPackTop3).toBe(true);
              expect(extraction.localResults).toHaveLength(3);
           });

           it('gives the same map pack whether parsed_data arrives as an object or a JSON string', () => {
              const parsedData = { organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }], locations };
              const run = (result: unknown) => crazyserp.serpExtractor!({
                 keyword: baseKeyword, response: {}, result, settings: { business_name: 'Vontainment' } as any,
              } as any);

              const fromObject = run(parsedData);
              const fromString = run(JSON.stringify(parsedData));

              expect(fromString.mapPackTop3).toBe(true);
              expect(fromString).toEqual(fromObject);
           });

           it('is false when no top-3 business matches, or there are no locations', () => {
              const noMatch = crazyserp.serpExtractor!({
                 keyword: baseKeyword, response: {}, result: { organic: [], locations }, settings: { business_name: 'Other Co' } as any,
              } as any);
              const none = crazyserp.serpExtractor!({
                 keyword: baseKeyword, response: {}, result: { organic: [] }, settings: { business_name: 'Vontainment' } as any,
              } as any);

              expect(noMatch.mapPackTop3).toBe(false);
              expect(none.mapPackTop3).toBe(false);
              expect(none.localResults).toEqual([]);
           });
        });

        it('extracts organic results from a JSON string or a pre-parsed array', () => {
           const results = [
              { title: 'Result 1', url: 'https://example.com', position: 1 },
              { title: 'Result 2', url: 'https://other.com', position: 2 },
           ];

           const fromString = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: {},
              result: JSON.stringify({ organic: results }),
           });
           expect(fromString.organic).toHaveLength(2);
           expect(fromString.organic[0]).toEqual({ title: 'Result 1', url: 'https://example.com', position: 1 });
           expect(fromString.organic[1]).toEqual({ title: 'Result 2', url: 'https://other.com', position: 2 });

           const fromArray = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: {},
              result: results,
           });
           expect(fromArray.organic).toHaveLength(2);
           expect(fromArray.organic[0].url).toBe('https://example.com');
        });

        it('falls back to response.organic, then response.parsed_data, when result is not provided', () => {
           const fromOrganic = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: { organic: [{ title: 'Fallback Result', url: 'https://fallback.com', position: 1 }] },
           });
           expect(fromOrganic.organic).toHaveLength(1);
           expect(fromOrganic.organic[0].url).toBe('https://fallback.com');

           const fromParsed = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: { parsed_data: [{ title: 'Parsed Result', url: 'https://parsed.com', position: 1 }] },
           });
           expect(fromParsed.organic).toHaveLength(1);
           expect(fromParsed.organic[0].url).toBe('https://parsed.com');
        });

        it('filters out items that are missing title or url', () => {
           const results = [
              { title: 'Good Result', url: 'https://good.com', position: 1 },
              { title: '', url: 'https://notitle.com', position: 2 },
              { title: 'No URL', url: '', position: 3 },
           ];

           const extraction = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: {},
              result: results,
           });

           expect(extraction.organic).toHaveLength(1);
           expect(extraction.organic[0].url).toBe('https://good.com');
        });

        it('throws on invalid JSON string response', () => {
           expect(() => {
              crazyserp.serpExtractor!({
                 keyword: baseKeyword,
                 response: {},
                 result: 'not valid json',
              });
           }).toThrow('Invalid JSON response for CrazySERP');
        });

        it('returns no organic results and no map pack when the response has no results or locations', () => {
           const empty = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: {},
              result: [],
           });
           expect(empty.organic).toHaveLength(0);

           const noLocations = crazyserp.serpExtractor!({
              keyword: baseKeyword,
              response: {},
              result: [{ title: 'R', url: 'https://r.com', position: 1 }],
           });
           expect(noLocations.mapPackTop3).toBe(false);
           expect(noLocations.localResults).toEqual([]);
        });
     });

     describe('configuration', () => {
        it('has the correct id and metadata, with supportsMapPack and allowsCity enabled', () => {
           expect(crazyserp.id).toBe('crazyserp');
           expect(crazyserp.name).toBe('CrazySERP');
           expect(crazyserp.supportsMapPack).toBe(true);
           expect(crazyserp.allowsCity).toBe(true);
        });

        it('sets Authorization header with Bearer token', () => {
           const keyword: Partial<KeywordType> = { keyword: 'test', country: 'US' };
           const headers = crazyserp.headers!(
              keyword as KeywordType,
              { scraping_api: 'my-api-key' } as SettingsType
           );
           expect((headers as Record<string, string>)['Authorization']).toBe('Bearer my-api-key');
        });
     });
  });
});

describe('prismcrawl', () => {
  const bodyOf = prismcrawl.body! as (...args: Parameters<NonNullable<ScraperSettings['body']>>) => any;

  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
    GB: ['United Kingdom', 'London', 'en', 2635],
  } as any;

  const settings = { scraping_api: 'prism-test-key' } as SettingsType;

  const buildKeyword = (overrides: Partial<KeywordType> = {}) =>
    ({ keyword: 'plumbers', country: 'US', device: 'desktop', location: '', domain: 'plumbers.example', ...overrides } as KeywordType);

  describe('prismcrawl scraper', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('is a POST scraper on the Google search endpoint with no query params, sending the API key as x-api-key', () => {
      expect(prismcrawl.method).toBe('POST');
      const url = prismcrawl.scrapeURL!(buildKeyword(), settings, countryData);
      expect(url).toBe('https://api.prismcrawl.com/v1/google/search');

      const headers = prismcrawl.headers!(buildKeyword(), settings);
      expect(headers['x-api-key']).toBe('prism-test-key');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('builds the JSON body with query, locale, domain and zero-based start offset, defaulting start to 0 without pagination', () => {
      const body = bodyOf(
        buildKeyword(),
        settings,
        countryData,
        { start: 20, num: 10, page: 3 },
      );
      expect(body).toMatchObject({
        query: 'plumbers',
        output: 'json',
        gl: 'us',
        hl: 'en',
        google_domain: 'google.com',
        start: 20,
      });
      expect(body).not.toHaveProperty('location');
      expect(body).not.toHaveProperty('device');
      expect(body).not.toHaveProperty('apiKey');

      expect(bodyOf(buildKeyword(), settings, countryData).start).toBe(0);
    });

    it('sends keywords as stored without decoding them', () => {
      const body = bodyOf(
        buildKeyword({ keyword: '50%25 off' }),
        settings,
        countryData,
      );
      expect(body.query).toBe('50%25 off');
    });

    it('includes city, state and country in location, and sets device to mobile for mobile keywords', () => {
      const body = bodyOf(
        buildKeyword({ location: 'Port Charlotte,FL,United States', device: 'mobile' as any }),
        settings,
        countryData,
      );
      expect(body.location).toBe('Port Charlotte,FL,United States');
      expect(body.device).toBe('mobile');
    });

    it('falls back to the US locale for unknown countries', () => {
      const body = bodyOf(
        buildKeyword({ country: 'ZZ' as any }),
        settings,
        countryData,
      );
      expect(body.gl).toBe('us');
      expect(body.hl).toBe('en');
    });

    describe('serpExtractor', () => {
      // Mirrors the live payload: { success, data: { content: { results } } }
      const payloadWith = (results: unknown[]) => ({
        success: true,
        data: { format: 'json', content: { results } },
      });
      const extract = (response: unknown) =>
        prismcrawl.serpExtractor({
          keyword: buildKeyword(),
          response: response as any,
          result: (response as any)?.data,
          settings,
        } as any);

      it('maps organic results into title/url/position items using position.absolute', () => {
        const { organic } = extract(payloadWith([
          { type: 'organic', title: 'Plumber A', url: 'https://a.example', position: { absolute: 1 } },
          { type: 'organic', title: 'Plumber B', url: 'https://b.example', position: { absolute: 2 } },
        ]));
        expect(organic).toEqual([
          { title: 'Plumber A', url: 'https://a.example', position: 1 },
          { title: 'Plumber B', url: 'https://b.example', position: 2 },
        ]);
      });

      it('uses the result domain in place of a Google redirect link, and leaves the link when there is no domain', () => {
        const { organic } = extract(payloadWith([
          { type: 'organic', title: 'Insurance Inspections', url: 'https://www.google.com/goto?url=CAESfwHE', domain: 'tailoredinspection.com', position: { absolute: 5 } },
          { type: 'organic', title: 'Facebook thread', url: 'https://www.google.com/goto?url=CAEShQEB', domain: '', position: { absolute: 3 } },
          { type: 'organic', title: 'Plain', url: 'https://a.example/', domain: 'a.example', position: { absolute: 1 } },
        ]));

        expect(organic[0].url).toBe('https://tailoredinspection.com/');
        expect(organic[1].url).toBe('https://www.google.com/goto?url=CAEShQEB');
        expect(organic[2].url).toBe('https://a.example/');
      });

      it('ignores non-organic items such as local_results and ai_summary', () => {
        const { organic } = extract(payloadWith([
          { type: 'ai_summary', title: 'AI Overview' },
          { type: 'organic', title: 'Keep', url: 'https://k.example', position: { absolute: 1 } },
        ]));
        expect(organic).toEqual([{ title: 'Keep', url: 'https://k.example', position: 1 }]);
      });

      it('skips organic entries missing a title or url', () => {
        const { organic } = extract(payloadWith([
          { type: 'organic', title: '', url: 'https://a.example', position: { absolute: 1 } },
          { type: 'organic', title: 'No url', position: { absolute: 2 } },
          { type: 'organic', title: 'Keep', url: 'https://c.example', position: { absolute: 3 } },
        ]));
        expect(organic).toEqual([{ title: 'Keep', url: 'https://c.example', position: 3 }]);
      });

      it('falls back to rank, then list index, when position.absolute is missing', () => {
        const { organic } = extract(payloadWith([
          { type: 'organic', title: 'Ranked', url: 'https://r.example', rank: 4 },
          { type: 'organic', title: 'Indexed', url: 'https://i.example' },
        ]));
        expect(organic.map((item) => item.position)).toEqual([4, 2]);
      });

      const withLocal = (items: unknown[]) => ({
        success: true,
        data: {
          content: {
            results: [],
            serp_features: [{ type: 'local_results', items }],
          },
        },
      });

      it('matches on business name against local result titles', () => {
        const out = prismcrawl.serpExtractor({
          keyword: buildKeyword(),
          response: withLocal([{ title: 'Cenizo - Downtown' }, { title: 'Acme Plumbing' }]) as any,
          result: undefined,
          settings: { ...settings, business_name: 'acme plumbing' } as any,
        } as any);
        expect(out.mapPackTop3).toBe(true);
      });

      it('returns no organic results when the payload has no results array', () => {
        expect(extract({ success: true, data: { content: {} } }).organic).toEqual([]);
        expect(extract({}).organic).toEqual([]);
      });
    });
  });

  describe('getScraperClient with a POST scraper', () => {
    it('sends a POST with the JSON body for POST scrapers, and GET with no body for scrapers without a method', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock as any;

      const keyword = buildKeyword({ location: 'Port Charlotte,FL,United States' });
      await getScraperClient(keyword, settings as SettingsType, prismcrawl, 0, { start: 10, num: 10, page: 2 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.prismcrawl.com/v1/google/search');
      expect(init.method).toBe('POST');
      expect(init.headers['x-api-key']).toBe('prism-test-key');
      expect(JSON.parse(init.body)).toMatchObject({
        query: 'plumbers',
        location: 'Port Charlotte,FL,United States',
        start: 10,
      });

      const getScraper = {
        id: 'get-test',
        name: 'Get',
        resultObjectKey: 'organic',
        scrapeURL: () => 'https://example.com/search?q=x',
        serpExtractor: () => ({ organic: [] }),
      } as ScraperSettings;

      fetchMock.mockClear();
      await getScraperClient(buildKeyword(), settings as SettingsType, getScraper, 0);

      const [, getInit] = fetchMock.mock.calls[0];
      expect(getInit.method).toBe('GET');
      expect(getInit.body).toBeUndefined();
    });
  });
});

describe('dataforseo', () => {
  const bodyOf = dataforseo.body! as (...args: Parameters<NonNullable<ScraperSettings['body']>>) => any;

  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
  } as any;

  const settings = { scraping_api: 'login@example.com:secret' } as SettingsType;

  const buildKeyword = (overrides: Partial<KeywordType> = {}) =>
    ({ keyword: 'plumbers', country: 'US', device: 'desktop', location: '', domain: 'plumbers.example', ...overrides } as KeywordType);

  const organic = (rank: number, host = `site${rank}.example`) => ({
    type: 'organic',
    title: `Result ${rank}`,
    url: `https://${host}/page`,
    rank_absolute: rank,
  });

  const payload = (items: unknown[], status_code = 20000) => ({
    tasks: [{ status_code, status_message: 'Ok.', result: [{ items }] }],
  });

  describe('dataforseo scraper', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('is a POST scraper hitting the live advanced endpoint', () => {
      expect(dataforseo.method).toBe('POST');
      expect(dataforseo.scrapeURL!(buildKeyword(), settings, countryData))
        .toBe('https://api.dataforseo.com/v3/serp/google/organic/live/advanced');
    });

    it('sends the login:password pair as HTTP Basic auth', () => {
      const headers = dataforseo.headers!(buildKeyword(), settings);
      expect(headers.Authorization).toBe(`Basic ${Buffer.from('login@example.com:secret').toString('base64')}`);
    });

    it('wraps the task object in a JSON array body', () => {
      const body = bodyOf(buildKeyword(), settings, countryData, { start: 0, num: 10, page: 1 });
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toMatchObject({
        keyword: 'plumbers',
        language_code: 'en',
        device: 'desktop',
        se_domain: 'google.com',
        depth: 10,
      });
    });

    it('requests depth up to the end of the requested page without a max_crawl_pages cap', () => {
      const body = bodyOf(buildKeyword(), settings, countryData, { start: 20, num: 10, page: 3 });
      expect((body[0] as any).depth).toBe(30);
      expect(body[0]).not.toHaveProperty('max_crawl_pages');
    });

    it('caps depth at 100', () => {
      const body = bodyOf(buildKeyword(), settings, countryData, { start: 100, num: 10, page: 11 });
      expect((body[0] as any).depth).toBe(100);
    });

    it('uses city, state and country for location_name when given, and sends device mobile for mobile keywords', () => {
      const body = bodyOf(
        buildKeyword({ location: 'Port Charlotte,Florida,United States', device: 'mobile' as any }),
        settings,
        countryData,
      );
      expect((body[0] as any).location_name).toBe('Port Charlotte,Florida,United States');
      expect((body[0] as any).device).toBe('mobile');
    });

    describe('serpExtractor', () => {
      it('returns only the requested page of organic results', () => {
        const items = Array.from({ length: 20 }, (_, i) => organic(i + 1));
        const out = dataforseo.serpExtractor({
          keyword: buildKeyword(),
          response: payload(items),
          result: payload(items).tasks,
          settings,
          pagination: { start: 10, num: 10, page: 2 },
        } as any);
        expect(out.organic).toHaveLength(10);
        expect(out.organic[0]).toEqual({ title: 'Result 11', url: 'https://site11.example/page', position: 11 });
        expect(out.organic[9].position).toBe(20);
      });

      it('skips organic items without a title or url and ignores non-organic items', () => {
        const items = [
          organic(1),
          { type: 'organic', title: 'No url', rank_absolute: 2 },
          { type: 'paid', title: 'Ad', url: 'https://ad.example', rank_absolute: 3 },
          organic(4),
        ];
        const out = dataforseo.serpExtractor({
          keyword: buildKeyword(),
          response: payload(items),
          result: payload(items).tasks,
          settings,
          pagination: { start: 0, num: 10, page: 1 },
        } as any);
        expect(out.organic.map((r) => r.position)).toEqual([1, 4]);
      });

      it('sets mapPackTop3 when the business name appears in the local_pack', () => {
        const items = [
          organic(1),
          { type: 'local_pack', title: 'Plumbers Co', rank_absolute: 1 },
          { type: 'local_pack', title: 'Other', rank_absolute: 2 },
        ];
        const out = dataforseo.serpExtractor({
          keyword: buildKeyword(),
          response: payload(items),
          result: payload(items).tasks,
          settings: { ...settings, business_name: 'Plumbers Co' } as any,
        } as any);
        expect(out.mapPackTop3).toBe(true);
      });

      it('reports false when no local_pack is present', () => {
        const items = [organic(1)];
        const out = dataforseo.serpExtractor({
          keyword: buildKeyword(),
          response: payload(items),
          result: payload(items).tasks,
          settings,
        } as any);
        expect(out.mapPackTop3).toBe(false);
      });

      it('throws with the DataForSEO status when the task failed', () => {
        const failed = payload([], 40101);
        expect(() =>
          dataforseo.serpExtractor({ keyword: buildKeyword(), response: failed, result: failed.tasks, settings } as any),
        ).toThrow(/DataForSEO error 40101/);
      });

      it('throws when the response has no tasks', () => {
        expect(() =>
          dataforseo.serpExtractor({ keyword: buildKeyword(), response: {}, result: undefined, settings } as any),
        ).toThrow(/missing tasks/);
      });
    });
  });
});

describe('valueserp', () => {
  describe('valueSerp scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'token-123' };
    const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      BR: ['Brazil', 'Brasilia', 'pt', 2064],
      GB: ['United Kingdom', 'London', 'en', 2828],
    } as any;

    it('omits pagination parameter while preserving locale and device options', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'best coffee beans',
        country: 'US',
        device: 'mobile',
        location: 'Miami,FL,United States',
      };

      const url = valueSerp.scrapeURL!(
        keyword as KeywordType,
        settings as SettingsType,
        countryData
      );
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://api.valueserp.com');
      expect(parsed.pathname).toBe('/search');
      expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
      expect(parsed.searchParams.get('gl')).toBe('us');
      expect(parsed.searchParams.get('hl')).toBe('en');
      expect(parsed.searchParams.get('device')).toBe('mobile');
      expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
      expect(parsed.searchParams.get('output')).toBe('json');
      expect(parsed.searchParams.get('google_domain')).toBe('google.com');
      expect(parsed.searchParams.has('num')).toBe(false);
      expect(parsed.toString()).toContain('q=best+coffee+beans');
    });

    it('uses country specific google domains (Brazil and the United Kingdom)', () => {
      const brazil: Partial<KeywordType> = {
        keyword: 'churrasco recipe',
        country: 'BR',
        device: 'desktop',
      };

      const brParsed = new URL(valueSerp.scrapeURL!(
        brazil as KeywordType,
        settings as SettingsType,
        countryData
      ));
      expect(brParsed.searchParams.get('gl')).toBe('br');
      expect(brParsed.searchParams.get('google_domain')).toBe('google.com.br');
      expect(brParsed.searchParams.get('hl')).toBe('pt');

      const uk: Partial<KeywordType> = {
        keyword: 'holiday cottages',
        country: 'GB',
        device: 'desktop',
      };

      const gbParsed = new URL(valueSerp.scrapeURL!(
        uk as KeywordType,
        settings as SettingsType,
        countryData
      ));
      expect(gbParsed.searchParams.get('gl')).toBe('gb');
      expect(gbParsed.searchParams.get('google_domain')).toBe('google.co.uk');
    });

    it('sends keyword and location values as stored without decoding them', () => {
      const keyword: Partial<KeywordType> = {
        keyword: '50%25 off',
        country: 'US',
        device: 'desktop',
        location: 'Austin,TX,United States',
      };

      const url = valueSerp.scrapeURL!(
        keyword as KeywordType,
        settings as SettingsType,
        countryData
      );
      const parsed = new URL(url);

      expect(parsed.searchParams.get('q')).toBe('50%25 off');
      expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');
      expect(parsed.toString()).toContain('q=50%2525+off');
      expect(parsed.toString()).toContain('location=Austin%2CTX%2CUnited+States');
    });

    it('has a timeout override to fail fast on hung requests', () => {
      expect(valueSerp.timeoutMs).toBe(20000);
    });

    describe('map pack detection', () => {
      it('detects map pack when domain is in local_results top 3', () => {
        const keyword: KeywordType = {
          ID: 1,
          keyword: 'pizza restaurant',
          device: 'desktop',
          country: 'US',
          domain: 'example.com',
          lastUpdated: '',
          volume: 0,
          added: '',
          position: 0,
          sticky: false,
          history: {},
          lastResult: [],
          url: '',
          tags: [],
          updating: false,
          lastUpdateError: false,
          mapPackTop3: false,
          location: 'Austin,TX,United States',
        };

        const mockResponse = {
          organic_results: [
            { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
            { title: 'Result 2', link: 'https://other.com/page2', position: 2 },
          ],
          local_results: [
            { title: 'Pizza Place 1', website: 'https://example.com', position: 1 },
            { title: 'Pizza Place 2', website: 'https://competitor.com', position: 2 },
            { title: 'Pizza Place 3', website: 'https://another.com', position: 3 },
          ],
        };

        const extraction = valueSerp.serpExtractor!({
          keyword,
          response: mockResponse,
          result: mockResponse.organic_results,
          settings: { business_name: 'Pizza Place 1' } as any,
        });

        expect(extraction.organic).toHaveLength(2);
        expect(extraction.mapPackTop3).toBe(true);
      });

      it('returns false when domain is not in local_results', () => {
        const keyword: KeywordType = {
          ID: 1,
          keyword: 'pizza restaurant',
          device: 'desktop',
          country: 'US',
          domain: 'example.com',
          lastUpdated: '',
          volume: 0,
          added: '',
          position: 0,
          sticky: false,
          history: {},
          lastResult: [],
          url: '',
          tags: [],
          updating: false,
          lastUpdateError: false,
          mapPackTop3: false,
          location: 'Austin,TX,United States',
        };

        const mockResponse = {
          organic_results: [
            { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
          ],
          local_results: [
            { title: 'Pizza Place 1', website: 'https://competitor1.com', position: 1 },
            { title: 'Pizza Place 2', website: 'https://competitor2.com', position: 2 },
            { title: 'Pizza Place 3', website: 'https://competitor3.com', position: 3 },
          ],
        };

        const extraction = valueSerp.serpExtractor!({
          keyword,
          response: mockResponse,
          result: mockResponse.organic_results,
        });

        expect(extraction.organic).toHaveLength(1);
        expect(extraction.mapPackTop3).toBe(false);
      });

      it('handles domain matching with www prefix correctly', () => {
        const keyword: KeywordType = {
          ID: 1,
          keyword: 'coffee shop',
          device: 'desktop',
          country: 'US',
          domain: 'example.com',
          lastUpdated: '',
          volume: 0,
          added: '',
          position: 0,
          sticky: false,
          history: {},
          lastResult: [],
          url: '',
          tags: [],
          updating: false,
          lastUpdateError: false,
          mapPackTop3: false,
          location: '',
        };

        const mockResponse = {
          organic_results: [],
          local_results: [
            { title: 'Shop 1', website: 'https://www.example.com', position: 1 },
          ],
        };

        const extraction = valueSerp.serpExtractor!({
          keyword,
          response: mockResponse,
          result: [],
          settings: { business_name: 'Shop 1' } as any,
        });

        expect(extraction.mapPackTop3).toBe(true);
      });

      it('detects map pack using alternative field names', () => {
        const keyword: KeywordType = {
          ID: 1,
          keyword: 'plumber near me',
          device: 'desktop',
          country: 'US',
          domain: 'example.com',
          lastUpdated: '',
          volume: 0,
          added: '',
          position: 0,
          sticky: false,
          history: {},
          lastResult: [],
          url: '',
          tags: [],
          updating: false,
          lastUpdateError: false,
          mapPackTop3: false,
          location: '',
        };

        const mockResponse = {
          organic_results: [],
          local_results: [
            { title: 'Plumber 1', link: 'https://example.com', position: 1 },
          ],
        };

        const extraction = valueSerp.serpExtractor!({
          keyword,
          response: mockResponse,
          result: [],
          settings: { business_name: 'Plumber 1' } as any,
        });

        expect(extraction.mapPackTop3).toBe(true);
      });
    });
  });
});

describe('providers delta', () => {
  describe('hasdata scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'hasdata-key' };
    const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      FR: ['France', 'Paris', 'fr', 2276],
    } as any;

    it('derives location from the parsed keyword location when city and state are present', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'best vegan restaurants',
        country: 'US',
        location: 'Los Angeles,CA,United States',
        device: 'desktop',
      };

      const url = hasdata.scrapeURL!(
        keyword as KeywordType,
        settings as SettingsType,
        countryData,
      );
      const parsed = new URL(url);

      expect(parsed.searchParams.get('location')).toBe('Los Angeles,CA,United States');
      expect(url).toContain('location=Los+Angeles%2CCA%2CUnited+States');
      expect(parsed.searchParams.get('deviceType')).toBe('desktop');
    });
  });

  describe('serper scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'secret-token' };
    const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      CA: ['Canada', 'Ottawa', 'en', 2392],
    } as any;

    it('targets the country only and does not send the stored city location', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'plumber near me',
        country: 'US',
        location: 'Austin,TX,United States',
      };

      const url = serper.scrapeURL!(
        keyword as KeywordType,
        settings as SettingsType,
        countryData
      );

      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://google.serper.dev');
      expect(parsed.pathname).toBe('/search');
      expect(parsed.searchParams.get('gl')).toBe('us');
      expect(parsed.searchParams.get('hl')).toBe('en');
      expect(parsed.searchParams.has('location')).toBe(false);
      expect(parsed.searchParams.get('apiKey')).toBe(settings.scraping_api);
    });

  });

  describe('serpapi scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'serpapi-key' };

    it('builds the search.json URL and encodes the location with + and %2C', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'best coffee shops',
        country: 'US',
        location: 'New York,NY,United States',
      };

      const url = serpapi.scrapeURL!(keyword as KeywordType, settings as SettingsType, {} as any);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://serpapi.com');
      expect(parsed.pathname).toBe('/search.json');
      expect(parsed.searchParams.get('location')).toBe('New York,NY,United States');
      expect(url).toContain('location=New+York%2CNY%2CUnited+States');
    });

    describe('local results', () => {
      const keyword = { keyword: 'coffee', domain: 'acme.example', device: 'desktop' } as any;
      const localSettings = { scraping_api: 'key', business_name: 'Acme Coffee' } as any;

      it('reads local_results.places with title and links.website, and leaves url undefined when a place has no website', () => {
        const response = {
          organic_results: [],
          local_results: {
            places: [
              { position: 1, title: 'Acme Coffee', links: { website: 'https://acme.example' } },
              { position: 2, title: 'Other Cafe', links: { website: 'https://other.example' } },
            ],
          },
        };
        const out = serpapi.serpExtractor({ keyword, response, result: [], settings: localSettings } as any);
        expect(out.localResults).toEqual([
          { position: 1, title: 'Acme Coffee', url: 'https://acme.example' },
          { position: 2, title: 'Other Cafe', url: 'https://other.example' },
        ]);
        expect(out.mapPackTop3).toBe(true);

        const noWebsite = {
          organic_results: [],
          local_results: { places: [{ position: 1, title: 'Acme Coffee' }] },
        };
        const outNoWebsite = serpapi.serpExtractor({ keyword, response: noWebsite, result: [], settings: localSettings } as any);
        expect(outNoWebsite.localResults).toEqual([{ position: 1, title: 'Acme Coffee', url: undefined }]);
      });
    });
  });

  describe('serply scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'token-123' };

    it('generates a query-string based API URL with search parameters', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'best coffee beans',
        country: 'US',
        device: 'desktop',
      };

      const url = serply.scrapeURL!(keyword as KeywordType, settings as SettingsType, {} as any);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://api.serply.io');
      expect(parsed.pathname).toBe('/v1/search');
      expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
      expect(parsed.searchParams.get('num')).toBe('10');
      // hl is the interface language (from the locale table), not the country code
      expect(parsed.searchParams.get('hl')).toBe('en');
      expect(parsed.searchParams.get('gl')).toBe('us');
    });

    it('preserves header configuration for device and country handling', () => {
      const mobileKeyword: Partial<KeywordType> = {
        keyword: 'espresso machines',
        country: 'CA',
        device: 'mobile',
      };

      const desktopKeyword: Partial<KeywordType> = {
        keyword: 'espresso machines',
        country: 'ZZ',
        device: 'desktop',
      };

      const mobileHeaders = serply.headers!(mobileKeyword as KeywordType, settings as SettingsType) as Record<string, string>;
      const desktopHeaders = serply.headers!(desktopKeyword as KeywordType, settings as SettingsType) as Record<string, string>;

      expect(mobileHeaders['X-User-Agent']).toBe('mobile');
      expect(mobileHeaders['X-Proxy-Location']).toBe('CA');
      expect(desktopHeaders['X-User-Agent']).toBe('desktop');
      expect(desktopHeaders['X-Proxy-Location']).toBe('US');
    });
  });

  describe('searchapi scraper', () => {
    const settings: Partial<SettingsType> = { scraping_api: 'searchapi-key' };
    const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      GB: ['United Kingdom', 'London', 'en', 2635],
    } as any;

    it('builds a valid URL with locale and location parameters', () => {
      const keyword: Partial<KeywordType> = {
        keyword: 'coffee shops',
        country: 'US',
        device: 'mobile',
        location: 'Austin,TX,United States',
      };

      const url = searchapi.scrapeURL!(keyword as KeywordType, settings as SettingsType, countryData);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://www.searchapi.io');
      expect(parsed.pathname).toBe('/api/v1/search');
      expect(parsed.searchParams.get('engine')).toBe('google');
      expect(parsed.searchParams.get('q')).toBe('coffee shops');
      expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');
      expect(parsed.searchParams.get('device')).toBe('mobile');
      expect(parsed.searchParams.get('api_key')).toBe('searchapi-key');
    });

    it('extracts organic results and map pack coverage from the API response', () => {
      const keyword = {
        ID: 1,
        keyword: 'coffee shops',
        country: 'US',
        domain: 'example.com',
        device: 'desktop',
        lastUpdated: '',
        volume: 0,
        added: '',
        position: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: false,
        location: '',
      } as KeywordType;

      const response = {
        organic_results: [
          { title: 'Example', link: 'https://example.com/page', position: 1 },
          { title: 'Other', link: 'https://other.com/page', position: 2 },
        ],
        local_results: [
          { title: 'Example Maps', link: 'https://www.google.com/searchviewer/10?svid=1', position: 1 },
        ],
      };

      const extraction = searchapi.serpExtractor({
        keyword,
        response,
        result: response.organic_results,
        settings: { scraping_api: 'searchapi-key', business_name: 'Example Maps' } as any,
      });

      expect(extraction.organic).toEqual([
        { title: 'Example', url: 'https://example.com/page', position: 1 },
        { title: 'Other', url: 'https://other.com/page', position: 2 },
      ]);
      expect(extraction.mapPackTop3).toBe(true);
      expect(extraction.localResults).toEqual([
        { position: 1, title: 'Example Maps', url: 'https://www.google.com/searchviewer/10?svid=1' },
      ]);
    });
  });
});

describe('providers matrix', () => {
  /**
   * Parameterized contract matrix for all scraper services.
   *
   * This file runs the universal scraper contract (from `scraperContract.ts`)
   * against every provider via `describe.each`.  Provider-specific behaviour
   * (custom extractors, pagination quirks, map-pack detection, etc.) lives in
   * the individual `<provider>.test.ts` delta files alongside this one.
   */



  // ---------------------------------------------------------------------------
  // Country-data fixtures shared across providers
  // ---------------------------------------------------------------------------

  // Country data tuple format: [countryName, capital, language, numericCode]
  const STANDARD_COUNTRY_DATA = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
    GB: ['United Kingdom', 'London', 'en', 2635],
    DE: ['Germany', 'Berlin', 'de', 2921],
    FR: ['France', 'Paris', 'fr', 2276],
    CA: ['Canada', 'Ottawa', 'en', 2392],
  } as any;

  // ---------------------------------------------------------------------------
  // Provider matrix
  // ---------------------------------------------------------------------------

  type ProviderEntry = Parameters<typeof runScraperURLContracts>[0];

  const providers: ProviderEntry[] = [
    {
      providerName: 'serpapi',
      scrapeURL: serpapi.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'serpapi-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'best coffee shops', country: 'US', device: 'desktop' as any },
      keywordCountryOnly: { keyword: 'organic coffee', country: 'US', location: '', device: 'desktop' as any },
    },
    {
      providerName: 'serper',
      scrapeURL: serper.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'serper-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'plumber near me', country: 'US', location: 'Austin,TX,United States', device: 'desktop' as any },
    },
    {
      providerName: 'hasdata',
      scrapeURL: hasdata.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'hasdata-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'best vegan restaurants', country: 'US', location: 'Los Angeles,CA,United States', device: 'desktop' as any },
      keywordCountryOnly: { keyword: 'seo agency', country: 'FR', location: '', device: 'mobile' as any },
    },
    {
      providerName: 'valueserp',
      scrapeURL: valueSerp.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'valueserp-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'best coffee beans', country: 'US', device: 'mobile' as any, location: 'Miami,FL,United States' },
      keywordCountryOnly: { keyword: 'coffee shops', country: 'US', device: 'desktop' as any },
    },
    {
      providerName: 'serply',
      scrapeURL: serply.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'serply-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'best coffee beans', country: 'US', device: 'desktop' as any },
    },
    {
      providerName: 'crazyserp',
      scrapeURL: crazyserp.scrapeURL!,
      settingsFactory: () => ({ scraping_api: 'crazyserp-test-key' }),
      countryDataFactory: () => STANDARD_COUNTRY_DATA,
      keywordWithSpaces: { keyword: 'best coffee shops', country: 'US', device: 'desktop' as any },
    },
  ];

  describe.each(providers.map((p) => [p.providerName, p] as const))(
    '%s – URL generation contract',
    (_name, config) => {
      runScraperURLContracts(config);
    },
  );

  describe('provider URL details', () => {
    const kw = { keyword: 'k', country: 'US', device: 'mobile', location: '' } as any;

    it('sends a lowercase gl to SerpApi', () => {
      const url = new URL(serpapi.scrapeURL!(kw, { scraping_api: 'x' } as any, {} as any) as string);
      expect(url.searchParams.get('gl')).toBe('us');
    });

    it('warns for every mobile keyword that Serper cannot return mobile results for', () => {
      const { logger } = require('../utils/logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      serper.scrapeURL!(kw, { scraping_api: 'x' } as any, {} as any);
      serper.scrapeURL!(kw, { scraping_api: 'x' } as any, {} as any);
      expect(warnSpy.mock.calls.filter(([msg]) => String(msg).includes('mobile'))).toHaveLength(2);
      warnSpy.mockRestore();
    });
  });
});

describe('map pack absent', () => {
  // Responses for queries where Google shows no map pack: the local section is missing or empty.
  const cases: Array<[string, any, any]> = [
    ['serpapi', serpapi, { organic_results: [] }],
    ['searchapi', searchapi, { organic_results: [] }],
    ['hasdata', hasdata, { organicResults: [] }],
    ['serply', serply, { results: [] }],
    ['valueserp', valueSerp, { organic_results: [] }],
    ['prismcrawl', prismcrawl, { data: { content: { results: [], serp_features: [] } } }],
    ['dataforseo', dataforseo, { tasks: [{ status_code: 20000, result: [{ items: [] }] }] }],
    ['crazyserp', crazyserp, { organic: [] }],
    ['serpbase', serpbase, { organic: [] }],
  ];

  describe('map pack when the response has no local results', () => {
    it('returns no map pack and an empty local list without throwing, on desktop and mobile, for every provider', () => {
      for (const [name, scraper, response] of cases) {
        for (const device of ['desktop', 'mobile']) {
          const extraction = scraper.serpExtractor({
            keyword: { keyword: 'coffee', domain: 'example.com', device },
            response,
            result: undefined,
            settings: { scraping_api: 'key', business_name: 'Acme Coffee' },
          } as any);

          // Labelled objects so a failure reports which provider and device broke.
          expect({ provider: name, device, mapPackTop3: extraction.mapPackTop3 }).toEqual({ provider: name, device, mapPackTop3: false });
          expect({ provider: name, device, localResults: extraction.localResults ?? [] }).toEqual({ provider: name, device, localResults: [] });
        }
      }
    });
  });

  describe('computeMapPackTop3', () => {
    const locals = [
      { position: 1, title: 'Acme Plumbing' },
      { position: 2, title: 'Other Co' },
      { position: 3, title: 'Third Ltd' },
      { position: 4, title: 'Fourth Inc' },
    ];

    it('matches the business name against the top three local results', () => {
      expect(computeMapPackTop3(locals, 'Acme Plumbing')).toBe(true);
      expect(computeMapPackTop3(locals, 'Third Ltd')).toBe(true);
    });

    it('ignores case and surrounding whitespace in the name', () => {
      expect(computeMapPackTop3(locals, '  acme PLUMBING ')).toBe(true);
    });

    it('does not match a business ranked below third', () => {
      expect(computeMapPackTop3(locals, 'Fourth Inc')).toBe(false);
    });

    it('returns false without a business name, or with no local results', () => {
      expect(computeMapPackTop3(locals, null)).toBe(false);
      expect(computeMapPackTop3([], 'Acme Plumbing')).toBe(false);
      expect(computeMapPackTop3(undefined, 'Acme Plumbing')).toBe(false);
    });

    it('does not use URLs for matching', () => {
      const withUrl = [{ position: 1, title: 'Other Co', url: 'https://example.com' }];
      expect(computeMapPackTop3(withUrl, 'Acme Plumbing')).toBe(false);
    });

    it('returns false when the business name is only whitespace', () => {
      const singleLocal = [{ position: 1, title: 'Some Business' }];
      expect(computeMapPackTop3(singleLocal, '   ')).toBe(false);
    });
  });
});

describe('serpbase', () => {
  const countryData = { US: ['United States', 'Washington, D.C.', 'en', 2840], DE: ['Germany', 'Berlin', 'de', 2921] } as any;
  const settings = { scraping_api: 'sb-key', business_name: 'Kula Coffee' } as unknown as SettingsType;
  const keyword = (overrides: Partial<KeywordType> = {}) =>
    ({ keyword: 'coffee shops', country: 'US', device: 'desktop', location: '', domain: 'example.com', ...overrides } as KeywordType);
  const bodyOf = serpbase.body! as (...args: Parameters<NonNullable<ScraperSettings['body']>>) => any;

  it('is a POST scraper with the key in the X-API-Key header', () => {
    expect(serpbase.method).toBe('POST');
    expect(serpbase.scrapeURL!(keyword(), settings, countryData)).toBe('https://api.serpbase.dev/google/search');
    expect(serpbase.headers!(keyword(), settings)['X-API-Key']).toBe('sb-key');
  });

  it('sends the query with country and language, and the page only after the first', () => {
    expect(bodyOf(keyword(), settings, countryData, { start: 0, num: 10, page: 1 })).toEqual({ q: 'coffee shops', gl: 'us', hl: 'en' });
    expect(bodyOf(keyword({ country: 'DE' }), settings, countryData, { start: 10, num: 10, page: 2 })).toEqual({ q: 'coffee shops', gl: 'de', hl: 'de', page: 2 });
  });

  it('is country level only and supports the map pack', () => {
    expect(serpbase.allowsCity).toBeFalsy();
    expect(serpbase.supportsMapPack).toBe(true);
  });

  const payload = {
    status: 0,
    local_results: [
      { title: 'HallowBean Coffee Co', position: 1, rank: 1 },
      { title: 'Kula Coffee', position: 1, rank: 2 },
    ],
    organic: [
      { title: 'Los Dos Cristianos', link: 'https://www.google.com/goto?url=abc', url: 'https://www.google.com/goto?url=abc', display_link: 'https://www.losdoscristianos.com', position: 2, rank: 1 },
      { title: 'Facebook thread', link: 'https://www.google.com/goto?url=def', display_link: 'www.facebook.com', position: 7, rank: 2 },
      { title: 'Tripadvisor', link: 'https://www.tripadvisor.com/Restaurants.html', display_link: 'https://www.tripadvisor.com', position: 10, rank: 3 },
      { title: 'Broken', display_link: 'https://nolink.example', rank: 4 },
    ],
  };
  const extract = (response: any, s = settings) => serpbase.serpExtractor({ keyword: keyword(), response, result: response.organic, settings: s } as any);

  it('uses rank for position, and the result domain when the link is a Google redirect', () => {
    const out = extract(payload);
    expect(out.organic).toEqual([
      { title: 'Los Dos Cristianos', url: 'https://www.losdoscristianos.com/', position: 1 },
      { title: 'Facebook thread', url: 'https://www.facebook.com/', position: 2 },
      { title: 'Tripadvisor', url: 'https://www.tripadvisor.com/Restaurants.html', position: 3 },
    ]);
  });

  it('keeps the redirect link when there is no usable display_link', () => {
    const out = extract({ organic: [{ title: 'X', link: 'https://www.google.com/goto?url=zzz', rank: 1 }] });
    expect(out.organic[0].url).toBe('https://www.google.com/goto?url=zzz');
  });

  it('reads the map pack and flags the business when it is in the top three', () => {
    const out = extract(payload);
    expect(out.localResults).toEqual([{ position: 1, title: 'HallowBean Coffee Co' }, { position: 2, title: 'Kula Coffee' }]);
    expect(out.mapPackTop3).toBe(true);
    expect(extract(payload, { ...settings, business_name: 'Somebody Else' } as unknown as SettingsType).mapPackTop3).toBe(false);
  });

  describe('credits', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('reads credits from the free account endpoint', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 0, credits: 12345, permanent_credits: 10000 }) });
      global.fetch = fetchMock as unknown as typeof fetch;
      expect(await serpbase.fetchCredits!(settings)).toBe(12345);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.serpbase.dev/account/credits');
      expect(fetchMock.mock.calls[0][1].headers['X-API-Key']).toBe('sb-key');
    });

    it('returns null when the lookup fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
      expect(await serpbase.fetchCredits!(settings)).toBeNull();
    });
  });
});
