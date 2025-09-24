import { resolveCountryCode } from '../../utils/scraperHelpers';
import { computeMapPackTop3 } from '../../utils/mapPack';

interface SerplyResult {
   title: string,
   link: string,
   realPosition: number,
}
const scraperCountries = ['US', 'CA', 'IE', 'GB', 'FR', 'DE', 'SE', 'IN', 'JP', 'KR', 'SG', 'AU', 'BR'];

const serply:ScraperSettings = {
   id: 'serply',
   name: 'Serply',
   website: 'serply.io',
   headers: (keyword, settings) => {
      const country = resolveCountryCode(keyword.country, scraperCountries);
      return {
         'Content-Type': 'application/json',
         'X-User-Agent': keyword.device === 'mobile' ? 'mobile' : 'desktop',
         'X-Api-Key': settings.scraping_api,
         'X-Proxy-Location': country,
      };
   },
   scrapeURL: (keyword) => {
      const country = resolveCountryCode(keyword.country, scraperCountries);
      const searchParams = new URLSearchParams({
         q: keyword.keyword,
         num: '100',
         hl: country,
      });
      return `https://api.serply.io/v1/search?${searchParams.toString()}`;
   },
   resultObjectKey: 'result',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword }) => {
      const extractedResult = [];
      let results: SerplyResult[] = [];
      if (typeof result === 'string') {
         try {
            results = JSON.parse(result) as SerplyResult[];
         } catch (error) {
            throw new Error(`Invalid JSON response for Serply: ${error instanceof Error ? error.message : error}`);
         }
      } else if (Array.isArray(result)) {
         results = result as SerplyResult[];
      } else if (Array.isArray(response?.result)) {
         results = response.result as SerplyResult[];
      }
      for (const item of results) {
         if (item?.title && item?.link) {
            extractedResult.push({
               title: item.title,
               url: item.link,
               position: item.realPosition,
            });
         }
      }

      const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default serply;
