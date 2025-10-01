import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';

interface HasDataResult {
   title: string,
   link: string,
   position: number,
}

const hasdata:ScraperSettings = {
   id: 'hasdata',
   name: 'HasData',
   website: 'hasdata.com',
   allowsCity: true,
   headers: (keyword: KeywordType, settings: SettingsType) => ({
         'Content-Type': 'application/json',
         'x-api-key': settings.scraping_api,
      }),
   scrapeURL: (keyword, _settings) => {
      const country = resolveCountryCode(keyword.country);
      const countryName = countries[country][0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const location = city || state ? `&location=${encodeURIComponent(locationParts.join(','))}` : '';
      return `https://api.scrape-it.cloud/scrape/google/serp?q=${encodeURIComponent(keyword.keyword)}${location}&num=100&gl=${country.toLowerCase()}&deviceType=${keyword.device}`;
   },
   resultObjectKey: 'organicResults',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword }) => {
      const extractedResult = [];
      let results: HasDataResult[] = [];
      if (typeof result === 'string') {
         try {
            results = JSON.parse(result) as HasDataResult[];
         } catch (error) {
            throw new Error(`Invalid JSON response for HasData: ${error instanceof Error ? error.message : error}`);
         }
      } else if (Array.isArray(result)) {
         results = result as HasDataResult[];
      } else if (Array.isArray(response?.organicResults)) {
         results = response.organicResults as HasDataResult[];
      }

      for (const { link, title, position } of results) {
         if (title && link) {
            extractedResult.push({
               title,
               url: link,
               position,
            });
         }
      }

      const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default hasdata;
