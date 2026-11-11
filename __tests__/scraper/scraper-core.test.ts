import { serializeError } from '../../utils/errorSerialization';
import { getScraperClient, getSerp, parseScraperResponse } from '../../utils/scraper';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import countries from '../../utils/countries';

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


});
