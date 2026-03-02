import countries, { getGoogleDomain } from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';

interface CrazySerpResult {
   position: number;
   url: string;
   title: string;
}

const crazyserp: ScraperSettings = {
   id: 'crazyserp',
   name: 'CrazySERP',
   website: 'crazyserp.com',
   allowsCity: true,
   supportsMapPack: false,
   resultObjectKey: 'parsed_data',
   headers: (_keyword: KeywordType, settings: SettingsType) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.scraping_api}`,
   }),
   scrapeURL: (keyword: KeywordType, _settings: SettingsType, countryData: countryData, pagination?: ScraperPagination) => {
      const country = resolveCountryCode(keyword.country);
      const localeInfo = countryData[country] ?? countryData.US ?? Object.values(countryData)[0];
      const lang = localeInfo?.[2] ?? 'en';
      const countryInfo = countries[country] ?? countries.US;
      const countryName = countryInfo?.[0] ?? 'United States';
      const locationString = keyword.location ? keyword.location.trim() : '';
      let location = countryName;
      if (locationString) {
         const normalizedLocation = locationString.toLowerCase();
         const normalizedCountry = countryName.toLowerCase();
         location = normalizedLocation.includes(normalizedCountry)
            ? locationString
            : `${locationString},${countryName}`;
      }
      const googleDomain = getGoogleDomain(country);
      const p = pagination || { start: 0, num: 10, page: 1 };
      const params = new URLSearchParams();
      params.set('q', keyword.keyword);
      params.set('page', String(p.num));
      params.set('pageOffset', String(p.start));
      params.set('location', location);
      params.set('googleDomain', googleDomain);
      params.set('gl', country.toLowerCase());
      params.set('hl', lang);
      params.set('safe', 'off');
      params.set('filter', '1');
      params.set('nfpr', '0');
      params.set('device', keyword.device || 'desktop');
      return `https://crazyserp.com/api/search?${params.toString()}`;
   },
   serpExtractor: ({ result, response }) => {
      const extractedResult = [];
      let results: CrazySerpResult[] = [];

      if (typeof result === 'string') {
         try {
            const parsed = JSON.parse(result);
            results = parsed.organic || parsed;
         } catch (error) {
            throw new Error(
               `Invalid JSON response for CrazySERP: ${error instanceof Error ? error.message : error}`
            );
         }
      } else if (Array.isArray(result)) {
         results = result as CrazySerpResult[];
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

      return { organic: extractedResult };
   },
};

export default crazyserp;
