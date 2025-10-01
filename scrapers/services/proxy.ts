import { getGoogleDomain } from '../../utils/googleDomains';
import { resolveCountryCode } from '../../utils/scraperHelpers';

const proxy:ScraperSettings = {
   id: 'proxy',
   name: 'Proxy',
   website: '',
   resultObjectKey: 'data',
   supportsMapPack: false,
   headers: () => ({ Accept: 'gzip,deflate,compress;' }),
   scrapeURL: (keyword: KeywordType) => {
      const country = resolveCountryCode(keyword.country);
      const googleDomain = getGoogleDomain(country);
      const googleUrl = new URL(`https://${googleDomain}/search`);
      googleUrl.searchParams.set('num', '100');
      googleUrl.searchParams.set('q', keyword.keyword);
      googleUrl.searchParams.set('gl', country.toLowerCase());
      return googleUrl.toString();
   },
};

export default proxy;
