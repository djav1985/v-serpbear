import countries from '../../utils/countries';
import { resolveCountryCode } from '../../utils/scraperHelpers';
import { parseLocation } from '../../utils/location';
import { computeMapPackTop3 } from '../../utils/mapPack';

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
  headers: (keyword: KeywordType, settings: SettingsType) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.scraping_api}`,
     }),
  scrapeURL: (keyword) => {
   const country = resolveCountryCode(keyword.country);
   const countryInfo = countries[country] ?? countries.US;
   const countryName = countryInfo?.[0] ?? countries.US[0];
   const { city, state } = parseLocation(keyword.location, keyword.country);
   const locationParts = [city, state, countryName].filter(Boolean);
   const location = city || state ? `&location=${encodeURIComponent(locationParts.join(','))}` : '';
     return `https://www.searchapi.io/api/v1/search?engine=google&q=${encodeURIComponent(keyword.keyword)}&num=100&gl=${country}&device=${keyword.device}${location}`;
  },
  resultObjectKey: 'organic_results',
  serpExtractor: ({ result, response, keyword }) => {
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

     const mapPackTop3 = computeMapPackTop3(keyword.domain, response);

     return { organic: extractedResult, mapPackTop3 };
  },
};

export default searchapi;
