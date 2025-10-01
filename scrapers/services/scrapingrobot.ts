import { getGoogleDomain } from '../../utils/googleDomains';
import { resolveCountryCode } from '../../utils/scraperHelpers';

const scrapingRobot:ScraperSettings = {
   id: 'scrapingrobot',
   name: 'Scraping Robot',
   website: 'scrapingrobot.com',
   supportsMapPack: false,
   scrapeURL: (keyword, settings, countryData) => {
      const country = resolveCountryCode(keyword.country);
      const device = keyword.device === 'mobile' ? '&mobile=true' : '';
      const fallbackCountryData = countryData?.US ?? ['United States', 'Washington, D.C.', 'en'];
      const lang = (countryData?.[country] ?? fallbackCountryData)[2];
      const googleDomain = getGoogleDomain(country);
      const googleUrl = new URL(`https://${googleDomain}/search`);
      googleUrl.searchParams.set('num', '100');
      googleUrl.searchParams.set('hl', lang);
      googleUrl.searchParams.set('gl', country.toLowerCase());
      googleUrl.searchParams.set('q', keyword.keyword);
      const encodedUrl = encodeURIComponent(googleUrl.toString());
      return `https://api.scrapingrobot.com/?token=${settings.scraping_api}&proxyCountry=${country}&render=false${device}&url=${encodedUrl}`;
   },
   resultObjectKey: 'result',
};

export default scrapingRobot;
