import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';

interface SpaceSerpResult {
   title: string,
   link: string,
   domain: string,
   position: number
}

const spaceSerp:ScraperSettings = {
   id: 'spaceSerp',
   name: 'Space Serp',
   website: 'spaceserp.com',
   allowsCity: true,
   scrapeURL: (keyword, settings, countryData) => {
      const country = resolveCountryCode(keyword.country);
      const countryInfo = countries[country] ?? countries.US;
      const countryName = countryInfo?.[0] ?? countries.US[0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const location = city || state ? `&location=${encodeURIComponent(locationParts.join(','))}` : '';
      const device = keyword.device === 'mobile' ? '&device=mobile' : '';
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const lang = localeInfo?.[2] ?? 'en';
      return `https://api.spaceserp.com/google/search?apiKey=${settings.scraping_api}&q=${encodeURIComponent(keyword.keyword)}&pageSize=100&gl=${country}&hl=${lang}${location}${device}&resultBlocks=`;
   },
   resultObjectKey: 'organic_results',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword, settings }) => {
      const extractedResult = [];
      let results: SpaceSerpResult[] = [];
      if (typeof result === 'string') {
         try {
            results = JSON.parse(result) as SpaceSerpResult[];
         } catch (error) {
            throw new Error(`Invalid JSON response for Space Serp: ${error instanceof Error ? error.message : error}`);
         }
      } else if (Array.isArray(result)) {
         results = result as SpaceSerpResult[];
      } else if (Array.isArray(response?.organic_results)) {
         results = response.organic_results as SpaceSerpResult[];
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

      const businessName = (settings as ExtendedSettings)?.business_name ?? null;
      const mapPackTop3 = computeMapPackTop3(keyword.domain, response, businessName);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default spaceSerp;
