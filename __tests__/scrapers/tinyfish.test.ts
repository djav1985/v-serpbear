import tinyfish from '../../scrapers/services/tinyfish';

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const countryData = { US: ['United States', 'Washington, D.C.', 'en', 2840], DE: ['Germany', 'Berlin', 'de', 2921] } as any;
const settings = { scraping_api: 'tf-key' } as any;

describe('tinyfish scraper', () => {
  it('is country-only, skips Serper resolving and builds a zero-indexed country request', () => {
    const { logger } = require('../../utils/logger');
    expect(tinyfish.allowsCity).toBe(false);
    expect(tinyfish.supportsMapPack).toBe(false);
    expect(tinyfish.reusesDesktopForMobile).toBe(true);
    expect(tinyfish.resolveGoogleUrl).toBe(false);
    expect(tinyfish.minRequestIntervalMs).toBe(2000);
    expect(tinyfish.headers!({} as any, settings)).toEqual({ 'X-API-Key': 'tf-key' });

    const kw = { keyword: 'best coffee', country: 'DE', device: 'desktop', location: 'Berlin,BE,Germany' } as any;
    const url = new URL(tinyfish.scrapeURL!(kw, settings, countryData, { start: 10, num: 10, page: 2 }));
    expect(url.origin).toBe('https://api.search.tinyfish.ai');
    expect(url.searchParams.get('query')).toBe('best coffee');
    expect(url.searchParams.get('location')).toBe('DE');
    expect(url.searchParams.get('language')).toBe('de');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.search).not.toContain('Berlin');

    const mobile = { keyword: 'k', country: 'US', device: 'mobile', location: '' } as any;
    expect(new URL(tinyfish.scrapeURL!(mobile, settings, countryData)).searchParams.get('page')).toBe('0');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('mobile'));
  });

  it('extracts results from an array, a JSON string or the response, and rejects invalid JSON', () => {
    const items = [{ position: 1, title: 'A', url: 'https://a.com' }, { position: 2, title: '', url: 'https://b.com' }];
    const expected = { organic: [{ position: 1, title: 'A', url: 'https://a.com' }] };
    expect(tinyfish.serpExtractor({ result: items, response: {}, keyword: {} as any, settings })).toEqual(expected);
    expect(tinyfish.serpExtractor({ result: JSON.stringify(items), response: {}, keyword: {} as any, settings })).toEqual(expected);
    expect(tinyfish.serpExtractor({ result: undefined as any, response: { results: items }, keyword: {} as any, settings })).toEqual(expected);
    expect(() => tinyfish.serpExtractor({ result: '{nope', response: {}, keyword: {} as any, settings }))
      .toThrow('Invalid JSON response for TinyFish');
  });

  describe('request spacing', () => {
    const { waitForScraperSlot } = require('../../utils/scraper');

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('spaces requests by the baseline plus the scrape delay, and does not gate scrapers without a baseline', async () => {
      const s = { scraping_api: 'spacing-a', scrape_delay: '5000' } as any;
      await waitForScraperSlot(tinyfish, s); // the first request starts at once
      let secondStarted = false;
      waitForScraperSlot(tinyfish, s).then(() => { secondStarted = true; });
      await jest.advanceTimersByTimeAsync(6999);
      expect(secondStarted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(secondStarted).toBe(true);

      const other = { id: 'other' } as any;
      await waitForScraperSlot(other, s);
      let otherStarted = false;
      waitForScraperSlot(other, s).then(() => { otherStarted = true; });
      await jest.advanceTimersByTimeAsync(0);
      expect(otherStarted).toBe(true);
    });
  });
});
