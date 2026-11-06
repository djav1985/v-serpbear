import jina from '../../scrapers/services/jina';

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const countryData = { US: ['United States', 'Washington, D.C.', 'en', 2840], DE: ['Germany', 'Berlin', 'de', 2921] } as any;
const settings = { scraping_api: 'jina-key' } as any;

describe('jina scraper', () => {
  it('is country-only, skips Serper resolving and builds a country request', () => {
    const { logger } = require('../../utils/logger');
    expect(jina.allowsCity).toBe(false);
    expect(jina.supportsMapPack).toBe(false);
    expect(jina.reusesDesktopForMobile).toBe(true);
    expect(jina.resolveGoogleUrl).toBe(false);
    expect(jina.minRequestIntervalMs).toBe(0);
    expect(jina.headers!({} as any, settings)).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer jina-key',
      'X-Respond-With': 'no-content',
    });

    const kw = { keyword: 'best coffee', country: 'DE', device: 'desktop', location: 'Berlin,BE,Germany' } as any;
    const first = new URL(jina.scrapeURL!(kw, settings, countryData, { start: 0, num: 10, page: 1 }));
    expect(first.origin).toBe('https://s.jina.ai');
    expect(first.searchParams.get('q')).toBe('best coffee');
    expect(first.searchParams.get('gl')).toBe('DE');
    expect(first.searchParams.get('hl')).toBe('de');
    expect(first.searchParams.has('page')).toBe(false);
    expect(first.search).not.toContain('Berlin');
    const second = new URL(jina.scrapeURL!(kw, settings, countryData, { start: 10, num: 10, page: 2 }));
    expect(second.searchParams.get('page')).toBe('2');

    jina.scrapeURL!({ keyword: 'k', country: 'US', device: 'mobile', location: '' } as any, settings, countryData);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('mobile'));
  });

  it('ranks results by their order in the list and rejects invalid JSON', () => {
    const items = [{ title: 'A', url: 'https://a.com' }, { title: '', url: 'https://b.com' }, { title: 'C', url: 'https://c.com' }];
    const expected = { organic: [{ title: 'A', url: 'https://a.com', position: 1 }, { title: 'C', url: 'https://c.com', position: 3 }] };
    expect(jina.serpExtractor({ result: items, response: {}, keyword: {} as any, settings })).toEqual(expected);
    expect(jina.serpExtractor({ result: JSON.stringify(items), response: {}, keyword: {} as any, settings })).toEqual(expected);
    expect(jina.serpExtractor({ result: undefined as any, response: { data: items }, keyword: {} as any, settings })).toEqual(expected);
    expect(() => jina.serpExtractor({ result: '{nope', response: {}, keyword: {} as any, settings }))
      .toThrow('Invalid JSON response for Jina AI');
  });
});
