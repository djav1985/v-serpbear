import prismcrawl from '../../scrapers/services/prismcrawl';
import { getScraperClient } from '../../utils/scraper';

const bodyOf = prismcrawl.body! as (...args: Parameters<NonNullable<ScraperSettings['body']>>) => any;

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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
      website: 'example.com',
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
