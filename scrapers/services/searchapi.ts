import { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts, fetchAccountJson, toCreditNumber } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from '../../utils/mapPack';
import { DEVICE_MOBILE } from '../../utils/constants';
import { asRecordArray, getPathValue } from '../../utils/typeGuards';

interface SearchApiResult {
   title: string,
   link: string,
   position: number,
 }

const searchapi:ScraperSettings = {
  id: 'searchapi',
  name: 'SearchApi.io',
   fetchCredits: async (settings: SettingsType) => {
      const data = await fetchAccountJson('https://www.searchapi.io/api/v1/me', { Authorization: `Bearer ${settings.scraping_api ?? ''}` });
      return toCreditNumber(getPathValue(data, 'account', 'remaining_credits'));
   },
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
     const rawLocal = asRecordArray(response.local_results);
     const localResults = rawLocal.filter((place) => typeof place.title === 'string').map((place, index) => ({
       position: index + 1,
       title: place.title as string,
       url: typeof place.link === 'string' ? place.link : undefined,
     }));
     const mapPackTop3 = computeMapPackTop3(localResults, businessName);

     return { organic: extractedResult, mapPackTop3, localResults };
  },
};

export default searchapi;
