import { getGoogleDomain } from "../../utils/countries";
import { resolveCountryCode, getKeywordLocationParts } from "../../utils/scraperHelpers";
import { computeMapPackTop3 } from "../../utils/mapPack";

interface CrazySerpResult {
   position: number;
   url: string;
   title: string;
}

// A business in the "locations" (map pack) block
interface CrazySerpLocation {
   title?: string;
   website_url?: string;
}

const crazyserp: ScraperSettings = {
   id: 'crazyserp',
   // Google redirect links in the results are resolved through Serper's /resolve (needs SERPER_API_KEY)
   resolveGoogleUrl: true,
   // No baseline spacing between requests
   minRequestIntervalMs: 0,
   method: "GET",
   usesResultOffset: false,
   reusesDesktopForMobile: false,
   name: 'CrazySERP',
   allowsCity: true,
   supportsMapPack: true,
   resultObjectKey: 'parsed_data',
   headers: (_keyword: KeywordType, settings: SettingsType) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.scraping_api}`,
   }),
   scrapeURL: (keyword: KeywordType, _settings: SettingsType, countryData: countryData, pagination?: ScraperPagination) => {
      const country = resolveCountryCode(keyword.country);
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const lang = localeInfo?.[2] ?? 'en';
      // The stored location ("City,State,Country Name") is sent as-is; country-only keywords have no location
      const [location] = getKeywordLocationParts(keyword.location);
      const googleDomain = getGoogleDomain(country);
      const p = pagination || { start: 0, num: 10, page: 1 };
      // CrazySERP paging: page = how many pages to fetch, pageOffset = 0-based index of the first page.
      // The strategy fetches one page at a time, so page is always 1.
      const params = new URLSearchParams();
      params.set('q', keyword.keyword);
      params.set('page', '1');
      params.set('pageOffset', String(Math.floor(p.start / p.num)));
      if (location) {
        params.set('location', location);
      }
      params.set('googleDomain', googleDomain);
      params.set('gl', country.toLowerCase());
      params.set('hl', lang);
      params.set('safe', 'off');
      params.set('filter', '1');
      params.set('nfpr', '0');
      params.set('device', keyword.device || 'desktop');
      return `https://crazyserp.com/api/search?${params.toString()}`;
   },
   serpExtractor: ({ result, response, settings }) => {
      const extractedResult = [];
      let results: CrazySerpResult[] = [];
      // Map pack businesses are in parsed_data.locations, beside organic, whether parsed_data arrives as an object or a JSON string
      let locations: CrazySerpLocation[] = [];

      if (typeof result === 'string') {
         try {
            const parsed = JSON.parse(result);
            // Accept either a plain list or an object with an organic list; anything else has no results
            results = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.organic) ? parsed.organic : []);
            locations = Array.isArray(parsed?.locations) ? parsed.locations : [];
         } catch (error) {
            throw new Error(
               `Invalid JSON response for CrazySERP: ${error instanceof Error ? error.message : error}`
            );
         }
      } else if (Array.isArray(result)) {
         results = result as CrazySerpResult[];
      } else if (result && typeof result === 'object' && Array.isArray((result as any).organic)) {
         results = (result as any).organic as CrazySerpResult[];
         locations = Array.isArray((result as any).locations) ? (result as any).locations : [];
      } else if (Array.isArray(response?.organic)) {
         results = response.organic as CrazySerpResult[];
      } else if (Array.isArray(response?.parsed_data)) {
         results = response.parsed_data as CrazySerpResult[];
      }

      for (const { url, title, position } of results) {
         if (title && url) {
            extractedResult.push({ title, url, position });
         }
      }

      const businessName = (settings as ExtendedSettings)?.business_name ?? null;
      const localResults = locations.map((place, index) => ({
         position: index + 1,
         title: place.title as string,
         url: (place.website_url || undefined) as string | undefined,
      }));
      const mapPackTop3 = computeMapPackTop3(localResults, businessName);

      return { organic: extractedResult, mapPackTop3, localResults };
   },
};

export default crazyserp;
