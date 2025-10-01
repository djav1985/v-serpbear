import countries from '../../utils/countries';
import { getGoogleDomain } from '../../utils/googleDomains';
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
      const googleDomain = getGoogleDomain(country);
      const countryName = countries[country]?.[0] ?? countries.US[0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const fallbackCountryData = countryData?.US ?? ['United States', 'Washington, D.C.', 'en'];
      const lang = (countryData?.[country] ?? fallbackCountryData)[2];
      const params = new URLSearchParams({
         apiKey: settings.scraping_api,
         q: keyword.keyword,
         pageSize: '100',
         gl: country.toLowerCase(),
         hl: lang,
         google_domain: googleDomain,
         resultBlocks: '',
      });

      if (keyword.device === 'mobile') {
         params.set('device', 'mobile');
      }

      if (locationParts.length) {
         params.set('location', locationParts.join(','));
      }

      return `https://api.spaceserp.com/google/search?${params.toString()}`;
   },
   resultObjectKey: 'organic_results',
   supportsMapPack: true,
   serpExtractor: ({ result, response, keyword }) => {
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

      const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

      return { organic: extractedResult, mapPackTop3 };
   },
};

export default spaceSerp;
