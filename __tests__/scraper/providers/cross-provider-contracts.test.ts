import crazyserp from '../../../scrapers/services/crazyserp';
import valueSerp from '../../../scrapers/services/valueserp';
import hasdata from '../../../scrapers/services/hasdata';
import serper from '../../../scrapers/services/serper';
import serpapi from '../../../scrapers/services/serpapi';
import serply from '../../../scrapers/services/serply';
import searchapi from '../../../scrapers/services/searchapi';
import { runScraperURLContracts } from '../../__helpers__/scraperContract';
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

describe('provider URL locale and device fallbacks', () => {
  it.each([
    { name: 'HasData', service: hasdata, country: 'ZZ' },
    { name: 'SearchApi.io', service: searchapi, country: 'ZZ' },
    { name: 'Serply', service: serply, country: 'ZZ' },
  ])('$name uses a safe language default when country metadata is absent', ({ name, service, country }) => {
    const url = service.scrapeURL!(buildKeyword({ country, device: undefined as any }), {} as SettingsType, {} as any);
    const parsed = new URL(url);

    expect(parsed.searchParams.get('hl')).toBe('en');
    if (name === 'HasData') expect(parsed.searchParams.get('deviceType')).toBe('desktop');
    if (name === 'SearchApi.io') expect(parsed.searchParams.has('device')).toBe(false);
    if (name === 'Serply') expect(service.headers!(buildKeyword({ country }), {} as SettingsType)['X-Proxy-Location']).toBe('US');
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
      const { logger } = require('../../../utils/logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      serper.scrapeURL!(kw, { scraping_api: 'x' } as any, {} as any);
      serper.scrapeURL!(kw, { scraping_api: 'x' } as any, {} as any);
      expect(warnSpy.mock.calls.filter(([msg]) => String(msg).includes('mobile'))).toHaveLength(2);
      warnSpy.mockRestore();
    });
  });
});
