import scrapingRobot from '../../scrapers/services/scrapingrobot';

describe('scrapingRobot scraper', () => {
  it('includes locale parameters in Google queries', () => {
    const keyword = {
      keyword: 'best coffee beans',
      country: 'US',
      device: 'desktop',
    } as any;
    const settings = { scraping_api: 'token-123' } as any;
    const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
    } as any;

    const url = scrapingRobot.scrapeURL(keyword, settings, countryData);

    // Parse the scraping robot URL to extract the encoded Google URL
    const scrapingRobotUrl = new URL(url);
    const googleUrlEncoded = scrapingRobotUrl.searchParams.get('url');
    expect(googleUrlEncoded).not.toBeNull();

    // Decode and parse the Google URL to verify its parameters
    const googleUrlDecoded = decodeURIComponent(googleUrlEncoded!);
    const googleUrlParsed = new URL(googleUrlDecoded);
    expect(googleUrlParsed.searchParams.get('num')).toBe('100');
    expect(googleUrlParsed.searchParams.get('hl')).toBe('en');
    expect(googleUrlParsed.searchParams.get('gl')).toBe('US');
    expect(googleUrlParsed.searchParams.get('q')).toBe(keyword.keyword);
  });
});
