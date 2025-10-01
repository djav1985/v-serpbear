import valueSerp from '../../scrapers/services/valueserp';

describe('valueSerp scraper', () => {
  const settings: Partial<SettingsType> = { scraping_api: 'token-123' };
  const countryData = {
    US: ['United States', 'Washington, D.C.', 'en', 2840],
    BR: ['Brazil', 'Brasilia', 'pt', 2064],
    GB: ['United Kingdom', 'London', 'en', 2828],
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
    expect(parsed.searchParams.get('gl')).toBe('us');
    expect(parsed.searchParams.get('hl')).toBe('en');
    expect(parsed.searchParams.get('device')).toBe('mobile');
    expect(parsed.searchParams.get('location')).toBe('Miami,FL,United States');
    expect(parsed.searchParams.get('output')).toBe('json');
    expect(parsed.searchParams.get('include_answer_box')).toBe('false');
    expect(parsed.searchParams.get('include_advertiser_info')).toBe('false');
    expect(parsed.searchParams.get('google_domain')).toBe('google.com');
    expect(parsed.searchParams.has('num')).toBe(false);
    expect(parsed.toString()).toContain('q=best+coffee+beans');
  });

  it('uses localized Google domains when available', () => {
    const brazilKeyword: Partial<KeywordType> = {
      keyword: 'cafés especiais',
      country: 'BR',
      device: 'desktop',
      location: 'Sao Paulo,BR',
    };

    const brazilUrl = valueSerp.scrapeURL!(
      brazilKeyword as KeywordType,
      settings as SettingsType,
      countryData
    );
    const brazilParams = new URL(brazilUrl).searchParams;

    expect(brazilParams.get('gl')).toBe('br');
    expect(brazilParams.get('google_domain')).toBe('google.com.br');

    const ukKeyword: Partial<KeywordType> = {
      keyword: 'best accountants',
      country: 'GB',
      device: 'desktop',
    };

    const ukUrl = valueSerp.scrapeURL!(
      ukKeyword as KeywordType,
      settings as SettingsType,
      countryData
    );
    const ukParams = new URL(ukUrl).searchParams;

    expect(ukParams.get('gl')).toBe('gb');
    expect(ukParams.get('google_domain')).toBe('google.co.uk');
  });

  it('has a timeout override of 35 seconds to handle longer response times', () => {
    expect(valueSerp.timeoutMs).toBe(35000);
  });
});
