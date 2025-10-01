import { getGoogleDomain } from '../../utils/googleDomains';
import { resolveCountryCode } from '../../utils/scraperHelpers';

const scrapingAnt:ScraperSettings = {
   id: 'scrapingant',
   name: 'ScrapingAnt',
   website: 'scrapingant.com',
   supportsMapPack: false,
   headers: (keyword: KeywordType) => {
      const mobileAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G996U Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36';
      return keyword && keyword.device === 'mobile' ? { 'Ant-User-Agent': mobileAgent } : {};
   },
   scrapeURL: (keyword: KeywordType, settings: SettingsType, countryData: countryData) => {
      const scraperCountries = ['AE', 'BR', 'CN', 'DE', 'ES', 'FR', 'GB', 'HK', 'PL', 'IN', 'IT', 'IL', 'JP', 'NL', 'RU', 'SA', 'US', 'CZ'];
      const country = resolveCountryCode(keyword.country, scraperCountries);
      const fallbackCountryData = countryData?.US ?? ['United States', 'Washington, D.C.', 'en'];
      const lang = (countryData?.[country] ?? fallbackCountryData)[2];
      const googleDomain = getGoogleDomain(country);
      const googleUrl = new URL(`https://${googleDomain}/search`);
      googleUrl.searchParams.set('num', '100');
      googleUrl.searchParams.set('hl', lang);
      googleUrl.searchParams.set('gl', country.toLowerCase());
      googleUrl.searchParams.set('q', keyword.keyword);
      const url = encodeURIComponent(googleUrl.toString());
      return `https://api.scrapingant.com/v2/extended?url=${url}&x-api-key=${settings.scraping_api}&proxy_country=${country}&browser=false`;
   },
   resultObjectKey: 'result',
};

export default scrapingAnt;
