import { serializeError } from '../../utils/errorSerialization';
import { getSerp } from '../../utils/scraper';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import countries from '../../utils/countries';

describe('resolveCountryCode', () => {
  it('returns the country when no allowed countries array (or an empty one) is provided', () => {
    expect(resolveCountryCode('CA')).toBe('CA');
    expect(resolveCountryCode('DE')).toBe('DE');
    expect(resolveCountryCode('CA', [])).toBe('CA');
    expect(resolveCountryCode('DE', [])).toBe('DE');
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

  it('supports custom fallback country', () => {
    const allowedCountries = ['CA', 'GB', 'DE'];
    expect(resolveCountryCode('FR', allowedCountries, 'CA')).toBe('CA');
    expect(resolveCountryCode('', allowedCountries, 'GB')).toBe('GB');
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
