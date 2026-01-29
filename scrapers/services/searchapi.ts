import countries, { getGoogleDomain } from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';
import { DEVICE_MOBILE } from '../../utils/constants';

interface SearchApiResult {
   title: string,
   link: string,
   position: number,
 }

type SearchApiResponse = {
   organic_results?: SearchApiResult[];
};

const searchapi:ScraperSettings = {
  id: 'searchapi',
  name: 'SearchApi.io',
  website: 'searchapi.io',
  allowsCity: true,
  supportsMapPack: true,
   headers: () => ({
      'Content-Type': 'application/json',
   }),
   scrapeURL: (keyword, settings, countryData) => {
      const resolvedCountry = resolveCountryCode(keyword.country);
      const country = resolvedCountry;
      const countryInfo = countries[country] ?? countries.US;
      const countryName = countryInfo?.[0] ?? countries.US[0];
      const localeInfo = countryData?.[country] ?? countryData?.US ?? Object.values(countryData ?? {})[0];
      const lang = localeInfo?.[2] ?? "en";
      const plusEncode = (str: string) => str.replace(/ /g, '+');
      const decodeIfEncoded = (value: string): string => {
         try {
            return decodeURIComponent(value);
         } catch (_error) {
            return value;
         }
      };
      // Build location parts from city/state/country only (no zip)
      const decodedLocation = typeof keyword.location === 'string' ? decodeIfEncoded(keyword.location) : keyword.location;
      const { city, state } = parseLocation(decodedLocation, keyword.country);
      const decodePart = (part?: string) => typeof part === 'string' ? plusEncode(decodeIfEncoded(part)) : undefined;
      const locationParts = [decodePart(city), decodePart(state)]
         .filter((v): v is string => Boolean(v));
      if (locationParts.length && countryName) {
         locationParts.push(plusEncode(countryName));
      }
      const params = new URLSearchParams();
      // Set params in required order
      params.set('api_key', settings.scraping_api ?? '');
      params.set('engine', 'google');
      params.set('q', plusEncode(decodeIfEncoded(keyword.keyword)));
      if (locationParts.length) {
         params.set('location', locationParts.join(','));
      }
      if (keyword.device === DEVICE_MOBILE) {
         params.set('device', DEVICE_MOBILE);
      }
      params.set('gl', country.toLowerCase());
      params.set('hl', lang);
      const googleDomain = getGoogleDomain(country);
      if (googleDomain) {
         params.set('google_domain', googleDomain);
      }
      return `https://www.searchapi.io/api/v1/search?${params.toString()}`;
   },
  resultObjectKey: 'organic_results',
   serpExtractor: ({ result, response, keyword, settings }) => {
      const extractedResult = [];
      const typedResponse = response as SearchApiResponse | undefined;
      let results: SearchApiResult[] = [];
     if (typeof result === 'string') {
        try {
           results = JSON.parse(result) as SearchApiResult[];
        } catch (error) {
           throw new Error(`Invalid JSON response for SearchApi.io: ${error instanceof Error ? error.message : error}`);
        }
     } else if (Array.isArray(result)) {
        results = result as SearchApiResult[];
      } else if (Array.isArray(typedResponse?.organic_results)) {
         results = typedResponse?.organic_results ?? [];
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

      const businessName = settings?.business_name ?? null;
      const mapPackTop3 = computeMapPackTop3(keyword.domain, response, businessName);

     return { organic: extractedResult, mapPackTop3 };
  },
};

export default searchapi;
