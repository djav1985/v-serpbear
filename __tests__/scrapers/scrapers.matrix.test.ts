/**
 * Parameterized contract matrix for all scraper services.
 *
 * This file runs the universal scraper contract (from `scraperContract.ts`)
 * against every provider via `describe.each`.  Provider-specific behaviour
 * (custom extractors, pagination quirks, map-pack detection, etc.) lives in
 * the individual `<provider>.test.ts` delta files alongside this one.
 */

import serpapi from '../../scrapers/services/serpapi';
import serper from '../../scrapers/services/serper';
import hasdata from '../../scrapers/services/hasdata';
import valueSerp from '../../scrapers/services/valueserp';
import serply from '../../scrapers/services/serply';
import crazyserp from '../../scrapers/services/crazyserp';

import { runScraperURLContracts } from '../__helpers__/scraperContract';

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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
    keywordCountryOnly: { keyword: 'organic coffee', country: 'US', location: 'US', device: 'desktop' as any },
  },
  {
    providerName: 'serper',
    scrapeURL: serper.scrapeURL!,
    settingsFactory: () => ({ scraping_api: 'serper-test-key' }),
    countryDataFactory: () => STANDARD_COUNTRY_DATA,
    keywordWithSpaces: { keyword: 'plumber near me', country: 'US', location: 'Austin,TX,US', device: 'desktop' as any },
  },
  {
    providerName: 'hasdata',
    scrapeURL: hasdata.scrapeURL!,
    settingsFactory: () => ({ scraping_api: 'hasdata-test-key' }),
    countryDataFactory: () => STANDARD_COUNTRY_DATA,
    keywordWithSpaces: { keyword: 'best vegan restaurants', country: 'US', location: 'Los Angeles,CA,US', device: 'desktop' as any },
    keywordCountryOnly: { keyword: 'seo agency', country: 'FR', location: 'FR', device: 'mobile' as any },
  },
  {
    providerName: 'valueserp',
    scrapeURL: valueSerp.scrapeURL!,
    settingsFactory: () => ({ scraping_api: 'valueserp-test-key' }),
    countryDataFactory: () => STANDARD_COUNTRY_DATA,
    keywordWithSpaces: { keyword: 'best coffee beans', country: 'US', device: 'mobile' as any, location: 'Miami,FL,US' },
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
