import serper from '../../scrapers/services/serper';

describe('serper scraper', () => {
  const settings: Partial<SettingsType> = { scraping_api: 'secret-token' };
  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
    CA: ['Canada', 'Ottawa', 'en', 2392],
  } as any;

  it('appends the encoded location parameter when city and state are provided', () => {
    const keyword: Partial<KeywordType> = {
      keyword: 'plumber near me',
      country: 'US',
      location: 'Austin,TX,US',
    };

    const url = serper.scrapeURL!(
      keyword as KeywordType,
      settings as SettingsType,
      countryData
    );

    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://google.serper.dev');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
    expect(parsed.searchParams.get('gl')).toBe('US');
    expect(parsed.searchParams.get('hl')).toBe('en');
    expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');
    expect(parsed.searchParams.get('apiKey')).toBe(settings.scraping_api);
    expect(url).toContain('q=plumber+near+me');
    expect(url).toContain('location=Austin%2CTX%2CUnited+States');
    expect(url).not.toContain('plumber%2Bnear%2Bme');
  });

});
