import hasdata from '../../scrapers/services/hasdata';
import serper from '../../scrapers/services/serper';
import serpapi from '../../scrapers/services/serpapi';
import serply from '../../scrapers/services/serply';
import searchapi from '../../scrapers/services/searchapi';

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

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
