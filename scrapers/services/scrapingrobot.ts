import { resolveCountryCode } from '../../utils/scraperHelpers';
import { DEVICE_MOBILE } from '../../utils/constants';

const scrapingRobot:ScraperSettings = {
   id: 'scrapingrobot',
   name: 'Scraping Robot',
   website: 'scrapingrobot.com',
   supportsMapPack: false,
   scrapeURL: (keyword, settings, countryData, pagination?: ScraperPagination) => {
      const country = resolveCountryCode(keyword.country);
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const device = keyword.device === DEVICE_MOBILE ? '&mobile=true' : '';
      const lang = localeInfo?.[2] ?? 'en';
      const p = pagination || { start: 0, num: 10 };
      const googleUrl = new URL('https://www.google.com/search');
      googleUrl.searchParams.set('num', String(p.num));
      googleUrl.searchParams.set('start', String(p.start));
      googleUrl.searchParams.set('hl', lang);
      googleUrl.searchParams.set('gl', country);
      googleUrl.searchParams.set('q', keyword.keyword);
      const encodedUrl = encodeURIComponent(googleUrl.toString());
      return `https://api.scrapingrobot.com/?token=${settings.scraping_api}&proxyCountry=${country}&render=false${device}&url=${encodedUrl}`;
   },
   resultObjectKey: 'result',
};

export default scrapingRobot;
