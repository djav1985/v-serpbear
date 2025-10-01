import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';
import { getGoogleDomain } from '../../utils/googleDomains';

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
   timeoutMs: 35000, // ValueSerp responses often take longer, allow 35 seconds
   scrapeURL: (keyword, settings, countryData) => {
      const resolvedCountry = resolveCountryCode(keyword.country);
      const countryName = countries[resolvedCountry]?.[0] ?? countries.US[0];
      const { city, state } = parseLocation(keyword.location, keyword.country);
      const locationParts = [city, state, countryName].filter(Boolean);
      const fallbackCountryData = countryData?.US ?? ['United States', 'Washington, D.C.', 'en'];
      const lang = (countryData?.[resolvedCountry] ?? fallbackCountryData)[2];
      const googleDomain = getGoogleDomain(resolvedCountry);

      const params = new URLSearchParams();
      params.set('api_key', settings.scraping_api ?? '');
      params.set('q', keyword.keyword);
      params.set('gl', resolvedCountry.toLowerCase());
      params.set('hl', lang);
      params.set('output', 'json');
      params.set('include_answer_box', 'false');
      params.set('include_advertiser_info', 'false');
      params.set('google_domain', googleDomain);

      if (keyword.device === 'mobile') {
         params.set('device', 'mobile');
      }

      if (locationParts.length) {
         params.set('location', locationParts.join(','));
      }

      return `https://api.valueserp.com/search?${params.toString()}`;
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
