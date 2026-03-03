import spaceSerp from '../../scrapers/services/spaceserp';

jest.mock('../../utils/logger', () => ({
   logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
   },
}));

describe('spaceSerp scraper', () => {
   const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      GB: ['United Kingdom', 'London', 'en', 2828],
   } as any;

   it('builds a valid API URL with the api key from settings', () => {
      const keyword = { keyword: 'best coffee', country: 'US', device: 'desktop' } as any;
      const settings = { scraping_api: 'my-api-key' } as any;

      const url = spaceSerp.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('https://api.spaceserp.com/google/search');
      expect(url).toContain('apiKey=my-api-key');
      expect(url).toContain('gl=US');
   });

   it('uses empty string for api key when scraping_api is undefined', () => {
      const keyword = { keyword: 'test', country: 'US', device: 'desktop' } as any;

      const url = spaceSerp.scrapeURL!(keyword, {} as any, countryData);

      expect(url).toContain('apiKey=');
      expect(url).not.toContain('undefined');
   });

   it('includes the keyword as a query parameter', () => {
      const keyword = { keyword: 'seo tools', country: 'US', device: 'desktop' } as any;
      const settings = { scraping_api: 'key' } as any;

      const url = spaceSerp.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('q=seo');
   });

   it('includes mobile device parameter for mobile keywords', () => {
      const keyword = { keyword: 'test', country: 'US', device: 'mobile' } as any;
      const settings = { scraping_api: 'key' } as any;

      const url = spaceSerp.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('device=mobile');
   });

   it('includes location when city or state is provided', () => {
      const keyword = { keyword: 'test', country: 'US', device: 'desktop', location: 'Austin,TX,US' } as any;
      const settings = { scraping_api: 'key' } as any;

      const url = spaceSerp.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('location=');
   });
});
