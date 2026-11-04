import { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from '../../utils/mapPack';
import { DEVICE_MOBILE } from '../../utils/constants';

interface SearchApiResult {
   title: string,
   link: string,
   position: number,
 }

const searchapi:ScraperSettings = {
  id: 'searchapi',
  name: 'SearchApi.io',
  website: 'searchapi.io',
  allowsCity: true,
  supportsMapPack: true,
   headers: () => ({
      'Content-Type': 'application/json',
   }),
   scrapeURL: (keyword, settings, countryData, pagination) => {
      const resolvedCountry = resolveCountryCode(keyword.country);
      const country = resolvedCountry;
      const localeInfo = countryData?.[country] ?? countryData?.US ?? Object.values(countryData ?? {})[0];
      const lang = localeInfo?.[2] ?? "en";
      // Build location parts from city/state/country only (no zip)
      const locationParts = getKeywordLocationParts(keyword.location);
      // URLSearchParams encodes spaces as '+', so the raw values are passed in; encoding '+' first would send '%2B'
      const params = new URLSearchParams();
      // Set params in required order
      params.set('api_key', settings.scraping_api ?? '');
      params.set('engine', 'google');
      params.set('q', keyword.keyword);
      if (locationParts.length) {
         params.set('location', locationParts.join(','));
      }
      if (keyword.device === DEVICE_MOBILE) {
         params.set('device', 'mobile');
      }
      params.set('gl', country.toLowerCase());
      params.set('hl', lang);
      if (pagination && pagination.page > 1) {
         params.set('page', String(pagination.page));
      }
      const googleDomain = getGoogleDomain(country);
      if (googleDomain) {
         params.set('google_domain', googleDomain);
      }
      return `https://www.searchapi.io/api/v1/search?${params.toString()}`;
   },
  resultObjectKey: 'organic_results',
  serpExtractor: ({ result, response, settings }) => {
     const extractedResult = [];
     let results: SearchApiResult[] = [];
     if (typeof result === 'string') {
        try {
           results = JSON.parse(result) as SearchApiResult[];
        } catch (error) {
           throw new Error(`Invalid JSON response for SearchApi.io: ${error instanceof Error ? error.message : error}`);
        }
     } else if (Array.isArray(result)) {
        results = result as SearchApiResult[];
     } else if (Array.isArray(response?.organic_results)) {
        results = response.organic_results as SearchApiResult[];
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

     const businessName = (settings as ExtendedSettings)?.business_name ?? null;
     const rawLocal: any[] = Array.isArray(response?.local_results) ? response.local_results : [];
     const localResults = rawLocal.map((place: any, index: number) => ({
       position: index + 1,
       title: place.title as string,
       url: (place.link || undefined) as string | undefined,
     }));
     const mapPackTop3 = computeMapPackTop3(localResults, businessName);

     return { organic: extractedResult, mapPackTop3, localResults };
  },
};

export default searchapi;
