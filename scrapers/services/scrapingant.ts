import { resolveCountryCode } from '../../utils/scraperHelpers';

const scrapingAnt:ScraperSettings = {
   id: 'scrapingant',
   name: 'ScrapingAnt',
   website: 'scrapingant.com',
   supportsMapPack: false,
   supportedCountries: ['AE', 'BR', 'CN', 'DE', 'ES', 'FR', 'GB', 'HK', 'PL', 'IN', 'IT', 'IL', 'JP', 'NL', 'RU', 'SA', 'US', 'CZ'],
   headers: (keyword: KeywordType) => {
      const mobileAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G996U Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36';
      return keyword && keyword.device === 'mobile' ? { 'Ant-User-Agent': mobileAgent } : {};
   },
   scrapeURL: (keyword: KeywordType, settings: SettingsType, countryData: countryData) => {
      const country = resolveCountryCode(keyword.country, ['AE', 'BR', 'CN', 'DE', 'ES', 'FR', 'GB', 'HK', 'PL', 'IN', 'IT', 'IL', 'JP', 'NL', 'RU', 'SA', 'US', 'CZ']);
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const lang = localeInfo?.[2] ?? 'en';
      const url = encodeURI(`https://www.google.com/search?num=100&hl=${lang}&q=${keyword.keyword}`);
      return `https://api.scrapingant.com/v2/extended?url=${url}&x-api-key=${settings.scraping_api}&proxy_country=${country}&browser=false`;
   },
   resultObjectKey: 'result',
};

export default scrapingAnt;
