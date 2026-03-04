import hasdata from '../../scrapers/services/hasdata';

describe('hasdata scraper', () => {
  const settings: Partial<SettingsType> = { scraping_api: 'hasdata-key' };
  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
    FR: ['France', 'Paris', 'fr', 2276],
  } as any;

  it('derives location from the parsed keyword location when city and state are present', () => {
    const keyword: Partial<KeywordType> = {
      keyword: 'best vegan restaurants',
      country: 'US',
      location: 'Los Angeles,CA,US',
      device: 'desktop',
    };

    const url = hasdata.scrapeURL!(
      keyword as KeywordType,
      settings as SettingsType,
      countryData,
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get('q')).toBe('best vegan restaurants');
    expect(parsed.searchParams.get('location')).toBe('Los Angeles,CA,United States');
    expect(url).toContain('q=best+vegan+restaurants');
    expect(url).toContain('location=Los+Angeles%2CCA%2CUnited+States');
    expect(parsed.searchParams.get('deviceType')).toBe('desktop');
  });
});
