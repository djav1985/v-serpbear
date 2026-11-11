import crazyserp from '../../../scrapers/services/crazyserp';
import prismcrawl from '../../../scrapers/services/prismcrawl';
import { getScraperClient } from '../../../utils/scraper';
import dataforseo from '../../../scrapers/services/dataforseo';
import serpbase from '../../../scrapers/services/serpbase';
import valueSerp from '../../../scrapers/services/valueserp';
import hasdata from '../../../scrapers/services/hasdata';
import serper from '../../../scrapers/services/serper';
import serpapi from '../../../scrapers/services/serpapi';
import serply from '../../../scrapers/services/serply';
import searchapi from '../../../scrapers/services/searchapi';
const buildKeyword = (overrides: Partial<KeywordType> = {}) =>
  ({ keyword: 'plumbers', country: 'US', device: 'desktop', location: '', domain: 'plumbers.example', ...overrides } as KeywordType);
jest.mock('../../../utils/logger', () => ({
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
  });

  describe('getScraperClient with a POST scraper', () => {
    afterEach(() => {
          jest.restoreAllMocks();
        });

    it('sends a POST with the JSON body for POST scrapers, and GET with no body for scrapers without a method', async () => {
          const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

          const keyword = buildKeyword({ location: 'Port Charlotte,FL,United States' });
          await getScraperClient(keyword, settings as SettingsType, prismcrawl, 0, { start: 10, num: 10, page: 2 });

          expect(fetchMock).toHaveBeenCalledTimes(1);
          const [url, init] = fetchMock.mock.calls[0];
          expect(url).toBe('https://api.prismcrawl.com/v1/google/search');
          expect(init?.method).toBe('POST');
          expect(new Headers(init?.headers).get('x-api-key')).toBe('prism-test-key');
          expect(JSON.parse(String(init?.body))).toMatchObject({
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

          const getInit = fetchMock.mock.calls[0]?.[1];
          expect(getInit?.method).toBe('GET');
          expect(getInit?.body).toBeUndefined();
        });
  });
});

describe('dataforseo', () => {
  const bodyOf = dataforseo.body! as (...args: Parameters<NonNullable<ScraperSettings['body']>>) => any;

  const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
    } as any;

  const settings = { scraping_api: 'login@example.com:secret' } as SettingsType;





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

    it('adds later-page pagination, omits city targeting, and falls back to the standard Google domain', () => {
          const url = searchapi.scrapeURL!(
            buildKeyword({ country: 'AI', device: 'desktop', location: '' }),
            {} as SettingsType,
            { AI: ['Anguilla', "Saint John's", 'en', 0] } as any,
            { start: 10, num: 10, page: 2 },
          );
          const parsed = new URL(url);

          expect(parsed.searchParams.get('page')).toBe('2');
          expect(parsed.searchParams.get('gl')).toBe('ai');
          expect(parsed.searchParams.has('location')).toBe(false);
          expect(parsed.searchParams.has('device')).toBe(false);
          expect(parsed.searchParams.get('google_domain')).toBe('google.com');
          expect(parsed.searchParams.get('api_key')).toBe('');
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
      expect(bodyOf(keyword(), settings, countryData, { start: 0, num: 10, page: 1 })).toEqual({ q: 'coffee shops', gl: 'us', hl: 'en', device: 'pc' });
      expect(bodyOf(keyword({ country: 'DE' }), settings, countryData, { start: 10, num: 10, page: 2 })).toEqual({ q: 'coffee shops', gl: 'de', hl: 'de', device: 'pc', page: 2 });
    });

  it('sends device mobile for mobile keywords', () => {
      expect(bodyOf(keyword({ device: 'mobile' as any }), settings, countryData).device).toBe('mobile');
    });

  it('sends the stored city location, and none for country-only keywords', () => {
      const city = bodyOf(keyword({ location: 'Port Charlotte,Florida,United States' }), settings, countryData);
      expect(city.location).toBe('Port Charlotte,Florida,United States');
      expect(bodyOf(keyword({ location: '' }), settings, countryData)).not.toHaveProperty('location');
    });

  it('allows city targeting and supports the map pack', () => {
      expect(serpbase.allowsCity).toBe(true);
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

  it('reads the map pack and flags the business when it is in the top three', () => {
      const out = extract(payload);
      expect(out.localResults).toEqual([{ position: 1, title: 'HallowBean Coffee Co' }, { position: 2, title: 'Kula Coffee' }]);
      expect(out.mapPackTop3).toBe(true);
      expect(extract(payload, { ...settings, business_name: 'Somebody Else' } as unknown as SettingsType).mapPackTop3).toBe(false);
    });
});
