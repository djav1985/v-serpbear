import crazyserp from '../../scrapers/services/crazyserp';

describe('crazyserp scraper', () => {
   const settings: Partial<SettingsType> = { scraping_api: 'crazyserp-key' };
   const countryData = {
      US: ['United States', 'Washington, D.C.', 'en', 2840],
      DE: ['Germany', 'Berlin', 'de', 2921],
      GB: ['United Kingdom', 'London', 'en', 2635],
   } as any;

   describe('scrapeURL', () => {
      it('builds a valid API URL with locale and device params', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'best coffee shops',
            country: 'US',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.origin).toBe('https://crazyserp.com');
         expect(parsed.pathname).toBe('/api/search');
         expect(parsed.searchParams.get('q')).toBe('best coffee shops');
         expect(parsed.searchParams.get('gl')).toBe('us');
         expect(parsed.searchParams.get('hl')).toBe('en');
         expect(parsed.searchParams.get('device')).toBe('desktop');
         expect(parsed.searchParams.get('googleDomain')).toBe('google.com');
      });

      it('uses country-specific Google domain for known countries', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'coffee',
            country: 'GB',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('gl')).toBe('gb');
         expect(parsed.searchParams.get('hl')).toBe('en');
         expect(parsed.searchParams.get('googleDomain')).toBe('google.co.uk');
      });

      it('sends the stored keyword.location as-is, and omits location for a blank country-only keyword', () => {
         const withLocation: Partial<KeywordType> = {
            keyword: 'plumber',
            country: 'US',
            location: 'Austin,TX,United States',
            device: 'desktop',
         };
         const countryOnly: Partial<KeywordType> = {
            keyword: 'seo tools',
            country: 'DE',
            device: 'desktop',
         };

         const parsed = new URL(crazyserp.scrapeURL!(
            withLocation as KeywordType,
            settings as SettingsType,
            countryData
         ));
         expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');

         const countryParsed = new URL(crazyserp.scrapeURL!(
            countryOnly as KeywordType,
            settings as SettingsType,
            countryData
         ));
         expect(countryParsed.searchParams.has('location')).toBe(false);
         expect(countryParsed.searchParams.get('gl')).toBe('de');
         expect(countryParsed.searchParams.get('hl')).toBe('de');
      });

      it('maps the 0-based page index to pageOffset, always fetches one page, and defaults to page=1/pageOffset=0 without pagination', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'coffee',
            country: 'US',
            device: 'desktop',
         };
         const pagination: ScraperPagination = { start: 20, num: 10, page: 3 };

         const paged = new URL(crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData,
            pagination
         ));
         // page 3 of results is pageOffset 2 (0-based), and only that one page is requested
         expect(paged.searchParams.get('page')).toBe('1');
         expect(paged.searchParams.get('pageOffset')).toBe('2');

         const unpaged = new URL(crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         ));
         expect(unpaged.searchParams.get('page')).toBe('1');
         expect(unpaged.searchParams.get('pageOffset')).toBe('0');
      });
   });

   describe('serpExtractor', () => {
      const baseKeyword: KeywordType = {
         ID: 1,
         keyword: 'coffee',
         country: 'US',
         domain: 'example.com',
         device: 'desktop',
         lastUpdated: '',
         volume: 0,
         added: '',
         position: 0,
         sticky: false,
         history: {},
         lastResult: [],
         url: '',
         tags: [],
         updating: false,
         lastUpdateError: false,
         mapPackTop3: false,
         location: '',
      };

      describe('map pack from locations', () => {
         const locations = [
            { title: 'CeJay Websites', website_url: 'https://cejaywebsites.com/', rating: 5 },
            { title: 'Vontainment', website_url: 'https://vontainment.com/' },
            { title: 'No Site' },
         ];

         it('reads the documented payload shape, where the scraper passes parsed_data as the result', () => {
            const response = {
               success: true,
               parsed_data: {
                  has_map: true,
                  organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }],
                  locations,
               },
            };

            const extraction = crazyserp.serpExtractor!({
               keyword: baseKeyword,
               response,
               result: response.parsed_data,
               settings: { business_name: 'Vontainment' } as any,
            } as any);

            expect(extraction.organic).toHaveLength(1);
            expect(extraction.mapPackTop3).toBe(true);
            expect(extraction.localResults).toHaveLength(3);
         });

         it('gives the same map pack whether parsed_data arrives as an object or a JSON string', () => {
            const parsedData = { organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }], locations };
            const run = (result: unknown) => crazyserp.serpExtractor!({
               keyword: baseKeyword, response: {}, result, settings: { business_name: 'Vontainment' } as any,
            } as any);

            const fromObject = run(parsedData);
            const fromString = run(JSON.stringify(parsedData));

            expect(fromString.mapPackTop3).toBe(true);
            expect(fromString).toEqual(fromObject);
         });

         it('is false when no top-3 business matches, or there are no locations', () => {
            const noMatch = crazyserp.serpExtractor!({
               keyword: baseKeyword, response: {}, result: { organic: [], locations }, settings: { business_name: 'Other Co' } as any,
            } as any);
            const none = crazyserp.serpExtractor!({
               keyword: baseKeyword, response: {}, result: { organic: [] }, settings: { business_name: 'Vontainment' } as any,
            } as any);

            expect(noMatch.mapPackTop3).toBe(false);
            expect(none.mapPackTop3).toBe(false);
            expect(none.localResults).toEqual([]);
         });
      });

      it('extracts organic results from a JSON string or a pre-parsed array', () => {
         const results = [
            { title: 'Result 1', url: 'https://example.com', position: 1 },
            { title: 'Result 2', url: 'https://other.com', position: 2 },
         ];

         const fromString = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: JSON.stringify({ organic: results }),
         });
         expect(fromString.organic).toHaveLength(2);
         expect(fromString.organic[0]).toEqual({ title: 'Result 1', url: 'https://example.com', position: 1 });
         expect(fromString.organic[1]).toEqual({ title: 'Result 2', url: 'https://other.com', position: 2 });

         const fromArray = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: results,
         });
         expect(fromArray.organic).toHaveLength(2);
         expect(fromArray.organic[0].url).toBe('https://example.com');
      });

      it('falls back to response.organic, then response.parsed_data, when result is not provided', () => {
         const fromOrganic = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: { organic: [{ title: 'Fallback Result', url: 'https://fallback.com', position: 1 }] },
         });
         expect(fromOrganic.organic).toHaveLength(1);
         expect(fromOrganic.organic[0].url).toBe('https://fallback.com');

         const fromParsed = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: { parsed_data: [{ title: 'Parsed Result', url: 'https://parsed.com', position: 1 }] },
         });
         expect(fromParsed.organic).toHaveLength(1);
         expect(fromParsed.organic[0].url).toBe('https://parsed.com');
      });

      it('filters out items that are missing title or url', () => {
         const results = [
            { title: 'Good Result', url: 'https://good.com', position: 1 },
            { title: '', url: 'https://notitle.com', position: 2 },
            { title: 'No URL', url: '', position: 3 },
         ];

         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: results,
         });

         expect(extraction.organic).toHaveLength(1);
         expect(extraction.organic[0].url).toBe('https://good.com');
      });

      it('throws on invalid JSON string response', () => {
         expect(() => {
            crazyserp.serpExtractor!({
               keyword: baseKeyword,
               response: {},
               result: 'not valid json',
            });
         }).toThrow('Invalid JSON response for CrazySERP');
      });

      it('returns no organic results and no map pack when the response has no results or locations', () => {
         const empty = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: [],
         });
         expect(empty.organic).toHaveLength(0);

         const noLocations = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: [{ title: 'R', url: 'https://r.com', position: 1 }],
         });
         expect(noLocations.mapPackTop3).toBe(false);
         expect(noLocations.localResults).toEqual([]);
      });
   });

   describe('configuration', () => {
      it('has the correct id and metadata, with supportsMapPack and allowsCity enabled', () => {
         expect(crazyserp.id).toBe('crazyserp');
         expect(crazyserp.name).toBe('CrazySERP');
         expect(crazyserp.supportsMapPack).toBe(true);
         expect(crazyserp.allowsCity).toBe(true);
      });

      it('sets Authorization header with Bearer token', () => {
         const keyword: Partial<KeywordType> = { keyword: 'test', country: 'US' };
         const headers = crazyserp.headers!(
            keyword as KeywordType,
            { scraping_api: 'my-api-key' } as SettingsType
         );
         expect((headers as Record<string, string>)['Authorization']).toBe('Bearer my-api-key');
      });
   });
});
