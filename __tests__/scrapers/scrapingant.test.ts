import scrapingAnt from '../../scrapers/services/scrapingant';

describe('scrapingAnt scraper', () => {
   const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      DE: ['Germany', 'Berlin', 'de', 2921],
   } as any;

   it('builds a valid API URL with the api key from settings', () => {
      const keyword = { keyword: 'best coffee', country: 'US', device: 'desktop' } as any;
      const settings = { scraping_api: 'my-api-key' } as any;

      const url = scrapingAnt.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('https://api.scrapingant.com/v2/extended');
      expect(url).toContain('x-api-key=my-api-key');
      expect(url).toContain('proxy_country=US');
   });

   it('uses empty string for api key when scraping_api is undefined', () => {
      const keyword = { keyword: 'test', country: 'US', device: 'desktop' } as any;

      const url = scrapingAnt.scrapeURL!(keyword, {} as any, countryData);

      expect(url).toContain('x-api-key=');
      expect(url).not.toContain('undefined');
   });

   it('includes pagination parameters in the google search URL', () => {
      const keyword = { keyword: 'seo tools', country: 'US', device: 'desktop' } as any;
      const settings = { scraping_api: 'key' } as any;
      const pagination = { start: 10, num: 20 } as any;

      const url = scrapingAnt.scrapeURL!(keyword, settings, countryData, pagination);

      // The google URL is embedded unencoded in the outer URL, so verify via the raw string
      expect(url).toContain('num=20');
      expect(url).toContain('start=10');
   });

   it('falls back to US country for unsupported countries', () => {
      const keyword = { keyword: 'test', country: 'ZZ', device: 'desktop' } as any;
      const settings = { scraping_api: 'key' } as any;

      const url = scrapingAnt.scrapeURL!(keyword, settings, countryData);

      expect(url).toContain('proxy_country=US');
   });
});
