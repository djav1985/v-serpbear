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

      it('uses keyword.location to build a city+country location string', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'plumber',
            country: 'US',
            location: 'Austin,TX',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');
      });

      it('passes through location as-is when it already contains the country name', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'plumber',
            country: 'US',
            location: 'Austin,TX,United States',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('location')).toBe('Austin,TX,United States');
      });

      it('defaults location to country name when keyword.location is not set', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'seo tools',
            country: 'DE',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('location')).toBe('Germany');
         expect(parsed.searchParams.get('gl')).toBe('de');
         expect(parsed.searchParams.get('hl')).toBe('de');
      });

      it('wires pagination start and num into pageOffset and page params', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'coffee',
            country: 'US',
            device: 'desktop',
         };
         const pagination: ScraperPagination = { start: 10, num: 10, page: 2 };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData,
            pagination
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('page')).toBe('10');
         expect(parsed.searchParams.get('pageOffset')).toBe('10');
      });

      it('defaults to page=10 and pageOffset=0 when no pagination is provided', () => {
         const keyword: Partial<KeywordType> = {
            keyword: 'coffee',
            country: 'US',
            device: 'desktop',
         };

         const url = crazyserp.scrapeURL!(
            keyword as KeywordType,
            settings as SettingsType,
            countryData
         );
         const parsed = new URL(url);

         expect(parsed.searchParams.get('page')).toBe('10');
         expect(parsed.searchParams.get('pageOffset')).toBe('0');
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

      it('extracts organic results from a JSON string response', () => {
         const results = [
            { title: 'Result 1', url: 'https://example.com', position: 1 },
            { title: 'Result 2', url: 'https://other.com', position: 2 },
         ];

         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: JSON.stringify({ organic: results }),
         });

         expect(extraction.organic).toHaveLength(2);
         expect(extraction.organic[0]).toEqual({ title: 'Result 1', url: 'https://example.com', position: 1 });
         expect(extraction.organic[1]).toEqual({ title: 'Result 2', url: 'https://other.com', position: 2 });
      });

      it('extracts results from a pre-parsed array', () => {
         const results = [
            { title: 'Result A', url: 'https://a.com', position: 1 },
         ];

         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: results,
         });

         expect(extraction.organic).toHaveLength(1);
         expect(extraction.organic[0].url).toBe('https://a.com');
      });

      it('falls back to response.organic when result is not provided', () => {
         const organicResults = [
            { title: 'Fallback Result', url: 'https://fallback.com', position: 1 },
         ];

         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: { organic: organicResults },
         });

         expect(extraction.organic).toHaveLength(1);
         expect(extraction.organic[0].url).toBe('https://fallback.com');
      });

      it('falls back to response.parsed_data when other sources are absent', () => {
         const parsedData = [
            { title: 'Parsed Result', url: 'https://parsed.com', position: 1 },
         ];

         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: { parsed_data: parsedData },
         });

         expect(extraction.organic).toHaveLength(1);
         expect(extraction.organic[0].url).toBe('https://parsed.com');
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

      it('returns empty organic array when no results are present', () => {
         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: [],
         });

         expect(extraction.organic).toHaveLength(0);
      });

      it('does not set mapPackTop3 (supportsMapPack is false)', () => {
         const extraction = crazyserp.serpExtractor!({
            keyword: baseKeyword,
            response: {},
            result: [{ title: 'R', url: 'https://r.com', position: 1 }],
         });

         expect(extraction.mapPackTop3).toBeUndefined();
      });
   });

   describe('configuration', () => {
      it('has the correct id and metadata', () => {
         expect(crazyserp.id).toBe('crazyserp');
         expect(crazyserp.name).toBe('CrazySERP');
         expect(crazyserp.website).toBe('crazyserp.com');
      });

      it('has supportsMapPack set to false', () => {
         expect(crazyserp.supportsMapPack).toBe(false);
      });

      it('has allowsCity set to true', () => {
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
