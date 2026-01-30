import { resolveCountryCode } from '../../utils/scraperHelpers';

const scrapingRobot:ScraperSettings = {
   id: 'scrapingrobot',
   name: 'Scraping Robot',
   website: 'scrapingrobot.com',
   supportsMapPack: false,
   scrapeURL: (keyword, settings, countryData) => {
      const country = resolveCountryCode(keyword.country);
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const device = keyword.device === 'mobile' ? '&mobile=true' : '';
      const lang = localeInfo?.[2] ?? 'en';
      const googleUrl = new URL('https://www.google.com/search');
      googleUrl.searchParams.set('num', '100');
      googleUrl.searchParams.set('hl', lang);
      googleUrl.searchParams.set('gl', country);
      googleUrl.searchParams.set('q', keyword.keyword);
      const encodedUrl = encodeURIComponent(googleUrl.toString());
      return `https://api.scrapingrobot.com/?token=${settings.scraping_api}&proxyCountry=${country}&render=false${device}&url=${encodedUrl}`;
   },
   resultObjectKey: 'result',
};

export default scrapingRobot;
