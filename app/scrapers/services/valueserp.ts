import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';

interface ValueSerpResult {
   title: string,
   link: string,
   position: number,
   domain: string,
}

const valueSerp:ScraperSettings = {
   id: 'valueserp',
   name: 'Value Serp',
   website: 'valueserp.com',
   allowsCity: true,
   scrapeURL: (keyword, settings, countryData) => {
      const country = resolveCountryCode(keyword.country);
      const countryName = countries[country][0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const location = city || state ? `&location=${encodeURIComponent(locationParts.join(','))}` : '';
      const device = keyword.device === 'mobile' ? '&device=mobile' : '';
      const lang = countryData[country][2];
      return `https://api.valueserp.com/search?api_key=${settings.scraping_api}&q=${encodeURIComponent(keyword.keyword)}&gl=${country}&hl=${lang}${device}${location}&output=json&include_answer_box=false&include_advertiser_info=false`;
   },
   resultObjectKey: 'organic_results',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword }) => {
      const extractedResult = [];
      let results: ValueSerpResult[] = [];
      if (typeof result === 'string') {
         try {
            results = JSON.parse(result) as ValueSerpResult[];
         } catch (error) {
            throw new Error(`Invalid JSON response for Value Serp: ${error instanceof Error ? error.message : error}`);
         }
      } else if (Array.isArray(result)) {
         results = result as ValueSerpResult[];
      } else if (Array.isArray(response?.organic_results)) {
         results = response.organic_results as ValueSerpResult[];
      }
      for (const item of results) {
         if (item?.title && item?.link) {
            extractedResult.push({
               title: item.title,
               url: item.link,
               position: item.position,
            });
         }
      }

      const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default valueSerp;
