import valueSerp from '../../app/scrapers/services/valueserp';

describe('valueSerp scraper', () => {
  const settings: Partial<SettingsType> = { scraping_api: 'token-123' };
  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
  } as any;

  it('does not log API key to console when generating URL', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    const keyword: Partial<KeywordType> = {
      keyword: 'test search',
      country: 'US',
      device: 'desktop',
    };

    valueSerp.scrapeURL!(
      keyword as KeywordType,
      settings as SettingsType,
      countryData
    );

    // Ensure console.log is not called with API key
    expect(consoleSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('omits pagination parameter while preserving locale and device options', () => {
    const keyword: Partial<KeywordType> = {
      keyword: 'best coffee beans',
      country: 'US',
      device: 'mobile',
      location: 'Miami,FL,US',
    };

    const url = valueSerp.scrapeURL!(
      keyword as KeywordType,
      settings as SettingsType,
      countryData
    );
    const parsed = new URL(url);

    expect(parsed.origin).toBe('https://api.valueserp.com');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe(keyword.keyword);
    expect(parsed.searchParams.get('gl')).toBe('US');
    expect(parsed.searchParams.get('hl')).toBe('en');
    expect(parsed.searchParams.get('device')).toBe('mobile');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('output')).toBe('json');
    expect(parsed.searchParams.get('include_answer_box')).toBe('false');
    expect(parsed.searchParams.get('include_advertiser_info')).toBe('false');
    expect(parsed.searchParams.has('num')).toBe(false);
  });
});
