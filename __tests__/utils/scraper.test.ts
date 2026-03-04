import { serializeError } from '../../utils/errorSerialization';
import { extractScrapedResult, getSerp, scrapeKeywordFromGoogle } from '../../utils/scraper';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import countries from '../../utils/countries';
import { GOOGLE_BASE_URL } from '../../utils/constants';

describe('resolveCountryCode', () => {
  it('returns the country when no allowed countries array is provided', () => {
    expect(resolveCountryCode('CA')).toBe('CA');
    expect(resolveCountryCode('DE')).toBe('DE');
  });

  it('returns fallback when country is empty or undefined', () => {
    expect(resolveCountryCode('')).toBe('US');
    expect(resolveCountryCode(undefined as any)).toBe('US');
    expect(resolveCountryCode('', ['CA', 'US'])).toBe('US');
  });

  it('returns country when it exists in allowed countries array', () => {
    const allowedCountries = ['US', 'CA', 'GB', 'DE'];
    expect(resolveCountryCode('CA', allowedCountries)).toBe('CA');
    expect(resolveCountryCode('ca', allowedCountries)).toBe('CA'); // normalized to uppercase
    expect(resolveCountryCode('GB', allowedCountries)).toBe('GB');
  });

  it('returns fallback when country is not in allowed countries array', () => {
    const allowedCountries = ['US', 'CA', 'GB', 'DE'];
    expect(resolveCountryCode('FR', allowedCountries)).toBe('US');
    expect(resolveCountryCode('ZZ', allowedCountries)).toBe('US');
  });

  it('supports case-insensitive matching for allowed countries', () => {
    const allowedCountries = ['US', 'CA', 'GB', 'DE'];
    expect(resolveCountryCode('ca', allowedCountries)).toBe('CA');
    expect(resolveCountryCode('us', allowedCountries)).toBe('US');
    expect(resolveCountryCode('gb', allowedCountries)).toBe('GB');
  });

  it('supports custom fallback country', () => {
    const allowedCountries = ['CA', 'GB', 'DE'];
    expect(resolveCountryCode('FR', allowedCountries, 'CA')).toBe('CA');
    expect(resolveCountryCode('', allowedCountries, 'GB')).toBe('GB');
  });

  it('handles empty allowed countries array', () => {
    expect(resolveCountryCode('CA', [])).toBe('CA');
    expect(resolveCountryCode('DE', [])).toBe('DE');
  });

  it('returns uppercase for valid country codes', () => {
    expect(resolveCountryCode('us')).toBe('US');
    expect(resolveCountryCode('US')).toBe('US');
    expect(resolveCountryCode('Ca')).toBe('CA');
  });

  it('returns uppercase that works with countries object lookup', () => {
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

  it('stringifies primitive values safely', () => {
    expect(serializeError(404)).toBe('404');
    expect(serializeError(true)).toBe('true');
  });

  it('returns the raw string for readable inputs', () => {
    const message = 'Simple error message';
    expect(serializeError(message)).toBe(message);
  });
});

describe('getSerp', () => {
  it('resolves Google interstitial links before matching domains', () => {
    const html = `
      <body>
        <div id="search">
          <div>
            <div>
              <div>
                <a href="/interstitial?url=https://example.com/landing">
                  <h3>Example site</h3>
                </a>
              </div>
            </div>
          </div>
        </div>
      </body>
    `;

    const extraction = extractScrapedResult(html, 'desktop', 'example.com');
    expect(extraction.organic).toHaveLength(1);
    expect(extraction.organic[0].url).toBe('https://example.com/landing');
    expect(extraction.mapPackTop3).toBe(false);

    const serp = getSerp('example.com', extraction.organic);
    expect(serp.position).toBe(1);
    expect(serp.url).toBe('https://example.com/landing');
  });

  it('returns the highest-ranking (lowest position number) match when the domain appears on multiple pages', () => {
    const results: Array<{ title: string; url: string; position: number }> = [
      { position: 45, url: 'https://example.com/page-a', title: '' }, // from page 5, scraped first (smart strategy)
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
});

describe('scraper error handling', () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts status code from request_info.status_code when res.status is missing', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 429,
        message: 'Rate limit exceeded',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('429');
  });

  it('includes request_info.message in error when other error fields are missing', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 503,
        message: 'VALUE SERP was unable to fulfil your request at this time, please retry...',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('503');
    expect(result.error).toContain('VALUE SERP was unable to fulfil your request');
  });

  it('prioritizes request_info.error over request_info.message', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        status_code: 400,
        error: 'Invalid API key',
        message: 'Some other message',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Invalid API key');
    expect(result.error).not.toContain('Some other message');
  });

  it('falls back to "Unknown Status" when no status code is available', async () => {
    const mockResponse = {
      request_info: {
        success: false,
        message: 'Something went wrong',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => mockResponse,
    });

    const keyword: Partial<KeywordType> = {
      ID: 1,
      keyword: 'test',
      domain: 'example.com',
      device: 'desktop',
      country: 'US',
      position: 0,
      url: '',
      lastResult: [],
      mapPackTop3: false,
    };

    const settings: Partial<SettingsType> = {
      scraper_type: 'valueserp',
      scraping_api: 'test-key',
    };

    const result = await scrapeKeywordFromGoogle(
      keyword as KeywordType,
      settings as SettingsType,
      0
    );

    if (!result) throw new Error('Expected a scrape result');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Unknown Status');
    expect(result.error).toContain('Something went wrong');
  });
});

describe('Google link filtering', () => {
  it('should filter out Google internal links properly', () => {
    const testGoogleUrlFiltering = (url: string): boolean => {
      try {
        const parsedURL = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsedURL.origin === GOOGLE_BASE_URL;
      } catch (_error) {
        return false;
      }
    };

    expect(testGoogleUrlFiltering('https://www.google.com/search?q=test')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com/maps')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com/news')).toBe(true);
    expect(testGoogleUrlFiltering('https://www.google.com')).toBe(true);
    expect(testGoogleUrlFiltering('https://example.com')).toBe(false);
    expect(testGoogleUrlFiltering('https://another-site.com/page')).toBe(false);
    expect(testGoogleUrlFiltering('https://google.com')).toBe(false);
    expect(testGoogleUrlFiltering('https://mail.google.com')).toBe(false);

    const testURL = new URL('https://www.google.com/search?q=test');
    expect(testURL.origin).toBe(GOOGLE_BASE_URL);
  });

  it('should handle malformed URLs gracefully', () => {
    const testSafeUrlParsing = (url: string): boolean => {
      try {
        const parsedURL = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsedURL.origin === GOOGLE_BASE_URL;
      } catch (_error) {
        return false;
      }
    };

    expect(testSafeUrlParsing('invalid-url')).toBe(false);
    expect(testSafeUrlParsing('://malformed')).toBe(false);
    expect(testSafeUrlParsing('')).toBe(false);

    expect(testSafeUrlParsing('https://example.com')).toBe(false);
    expect(testSafeUrlParsing('https://www.google.com/test')).toBe(true);
  });

  it('demonstrates the fix for the logical flaw mentioned in issue #302', () => {
    const absoluteUrl = 'https://www.google.com/search?q=test';

    const brokenCheck = absoluteUrl.startsWith('/');
    expect(brokenCheck).toBe(false);

    const parsedURL = new URL(absoluteUrl);
    const correctCheck = parsedURL.origin === GOOGLE_BASE_URL;
    expect(correctCheck).toBe(true);
  });
});
