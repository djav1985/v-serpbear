/**
 * Shared contract assertions for scraper services.
 *
 * Use `runScraperURLContracts` inside a `describe` block within any scraper
 * test file to enforce the universal scraper URL-generation contract without
 * duplicating the same checks across every provider file.
 */

export interface ScraperContractConfig {
  /** Human-readable name used in test descriptions. */
  providerName: string;
  /** The scraper's `scrapeURL` function under test. */
  scrapeURL: (
    keyword: KeywordType,
    settings: SettingsType,
    countries: Record<string, any>,
    pagination?: ScraperPagination,
  ) => string;
  /** Factory returning minimal valid settings (must include scraping_api). */
  settingsFactory: () => Partial<SettingsType>;
  /** Factory returning country-data map; defaults to empty object. */
  countryDataFactory?: () => Record<string, any>;
  /**
   * A keyword whose `.keyword` field contains a space.
   * When provided, the contract verifies `+` encoding in the raw URL.
   * When omitted, the space-encoding check is skipped for this provider.
   */
  keywordWithSpaces?: Partial<KeywordType>;
  /**
   * A keyword whose `.location` matches only the country code (no city/state).
   * When provided, the contract verifies that the `location` param is absent.
   * When omitted, the location-omission check is skipped for this provider.
   */
  keywordCountryOnly?: Partial<KeywordType>;
}

// [countryName, capital, language, numericCode]
const DEFAULT_COUNTRY_DATA = {
  US: ['United States', 'Washington, D.C.', 'en', 2840],
};

/**
 * Registers shared `it(...)` blocks that every scraper's `scrapeURL` must pass.
 *
 * Call this inside a `describe` block in the provider-specific test file:
 *
 * ```ts
 * import { runScraperURLContracts } from '../__helpers__/scraperContract';
 *
 * describe('myscraper – URL contract', () => {
 *   runScraperURLContracts({
 *     providerName: 'myscraper',
 *     scrapeURL: myscraper.scrapeURL!,
 *     settingsFactory: () => ({ scraping_api: 'key' }),
 *     keywordWithSpaces: { keyword: 'best coffee shops', country: 'US' },
 *   });
 * });
 * ```
 */
export function runScraperURLContracts(config: ScraperContractConfig): void {
  const {
    scrapeURL,
    settingsFactory,
    countryDataFactory,
    keywordWithSpaces,
    keywordCountryOnly,
  } = config;

  const settings = settingsFactory() as SettingsType;
  const countryData = countryDataFactory ? countryDataFactory() : DEFAULT_COUNTRY_DATA;

  // One test per provider, so the contract adds a single test for each of them
  it('generates a clean, correctly encoded URL', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const keyword = {
        keyword: 'coffee',
        country: 'US',
        device: 'desktop',
      } as KeywordType;
      scrapeURL(keyword, settings, countryData);
      // Nothing is written to console.log while generating a URL
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }

    if (keywordWithSpaces) {
      // Spaces in the keyword are encoded as + (application/x-www-form-urlencoded), not %2B
      const url = scrapeURL(keywordWithSpaces as KeywordType, settings, countryData);
      const params = new URL(url).searchParams;
      const q = params.get('q') ?? params.get('keyword') ?? params.get('query');
      // URLSearchParams.get() decodes + back to spaces – confirm the decoded value round-trips
      expect(q).toBe(keywordWithSpaces.keyword);
      // The raw URL must not contain a literal %2B (double-encoding of +)
      expect(url).not.toMatch(/%2B/i);
      // The keyword portion must be present in + form (spaces → +)
      const encoded = encodeURIComponent(keywordWithSpaces.keyword!).replace(/%20/g, '+');
      expect(url).toContain(encoded);
    }

    if (keywordCountryOnly) {
      // The location parameter is omitted when only the country code is provided
      const url = scrapeURL(keywordCountryOnly as KeywordType, settings, countryData);
      expect(new URL(url).searchParams.has('location')).toBe(false);
    }
  });
}
