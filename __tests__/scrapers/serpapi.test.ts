import serpapi from '../../scrapers/services/serpapi';

describe('serpapi scraper', () => {
  const settings: Partial<SettingsType> = { scraping_api: 'serpapi-key' };

  it('encodes spaces with + while preserving decoded values', () => {
    const keyword: Partial<KeywordType> = {
      keyword: 'best coffee shops',
      country: 'US',
      location: 'New York,NY,US',
    };

    const url = serpapi.scrapeURL!(keyword as KeywordType, settings as SettingsType, {} as any);
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://serpapi.com');
    expect(parsed.pathname).toBe('/search.json');
    expect(parsed.searchParams.get('q')).toBe('best coffee shops');
    expect(parsed.searchParams.get('location')).toBe('New York,NY,United States');
    expect(url).toContain('q=best+coffee+shops');
    expect(url).toContain('location=New+York%2CNY%2CUnited+States');
    expect(url).not.toContain('best%2Bcoffee%2Bshops');
  });
});
