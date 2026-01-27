import { filterKeywords, matchesCountry, matchesSearch, matchesTags, sortKeywords } from '../../../utils/client/sortFilter';

describe('filterKeywords helpers', () => {
   const createKeyword = (overrides: Partial<KeywordType> = {}): KeywordType => ({
      ID: 1,
      keyword: 'Sample Keyword',
      device: 'desktop',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '2024-01-01',
      added: '2024-01-01',
      position: 1,
      volume: 100,
      sticky: false,
      history: {},
      lastResult: [],
      url: 'https://example.com',
      tags: ['seo'],
      updating: false,
      lastUpdateError: false,
      ...overrides,
   });

   it('matchesCountry handles empty filters and exact matches', () => {
      expect(matchesCountry('US', [])).toBe(true);
      expect(matchesCountry('US', ['US'])).toBe(true);
      expect(matchesCountry('US', ['GB'])).toBe(false);
   });

   it('matchesSearch performs case-insensitive lookups', () => {
      expect(matchesSearch('Hello World', '')).toBe(true);
      expect(matchesSearch('Hello World', 'hello')).toBe(true);
      expect(matchesSearch('Hello World', 'WORLD')).toBe(true);
      expect(matchesSearch('Hello World', 'planet')).toBe(false);
   });

   it('matchesTags checks tag inclusion', () => {
      expect(matchesTags(['seo', 'ppc'], [])).toBe(true);
      expect(matchesTags(['seo', 'ppc'], ['ppc'])).toBe(true);
      expect(matchesTags(['seo'], ['ppc'])).toBe(false);
   });

   it('filterKeywords filters by combined predicates', () => {
      const keywords = [
         createKeyword({ ID: 1, keyword: 'Amazing SEO Tips', country: 'US', tags: ['seo'] }),
         createKeyword({ ID: 2, keyword: 'Local PPC Guide', country: 'GB', tags: ['ppc'] }),
         createKeyword({ ID: 3, keyword: 'Technical SEO Checklist', country: 'US', tags: ['seo', 'tech'] }),
      ];

      const filtered = filterKeywords(keywords, {
         countries: ['US'],
         search: 'seo',
         tags: ['seo'],
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((item) => item.ID)).toEqual([1, 3]);
   });
});

describe('sortKeywords', () => {
   const buildKeyword = (overrides: Partial<KeywordType>): KeywordType => ({
      ID: overrides.ID ?? Math.random(),
      keyword: 'keyword',
      device: 'desktop',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '2024-01-01',
      added: '2024-01-01',
      position: 1,
      volume: 10,
      sticky: false,
      history: {},
      lastResult: [],
      url: 'https://example.com',
      tags: [],
      updating: false,
      lastUpdateError: false,
      ...overrides,
   });

   it('sorts by added date ascending and descending', () => {
      const keywords = [
         buildKeyword({ ID: 1, keyword: 'alpha', added: '2024-01-03' }),
         buildKeyword({ ID: 2, keyword: 'bravo', added: '2024-01-01' }),
         buildKeyword({ ID: 3, keyword: 'charlie', added: '2024-01-02' }),
      ];

      expect(sortKeywords(keywords, 'date_asc').map((k) => k.ID)).toEqual([2, 3, 1]);
      expect(sortKeywords(keywords, 'date_desc').map((k) => k.ID)).toEqual([1, 3, 2]);
   });

   it('sorts by position while keeping zero-position keywords last on asc', () => {
      const keywords = [
         buildKeyword({ ID: 1, keyword: 'alpha', position: 3 }),
         buildKeyword({ ID: 2, keyword: 'bravo', position: 0 }),
         buildKeyword({ ID: 3, keyword: 'charlie', position: 12 }),
      ];

      expect(sortKeywords(keywords, 'pos_asc').map((k) => k.ID)).toEqual([1, 3, 2]);
      expect(sortKeywords(keywords, 'pos_desc').map((k) => k.ID)).toEqual([2, 3, 1]);
   });

   it('sorts alphabetically in both directions', () => {
      const keywords = [
         buildKeyword({ ID: 1, keyword: 'charlie' }),
         buildKeyword({ ID: 2, keyword: 'alpha' }),
         buildKeyword({ ID: 3, keyword: 'bravo' }),
      ];

      expect(sortKeywords(keywords, 'alpha_asc').map((k) => k.ID)).toEqual([2, 3, 1]);
      expect(sortKeywords(keywords, 'alpha_desc').map((k) => k.ID)).toEqual([1, 3, 2]);
   });

   it('sorts by search volume', () => {
      const keywords = [
         buildKeyword({ ID: 1, volume: 500 }),
         buildKeyword({ ID: 2, volume: 0 }),
         buildKeyword({ ID: 3, volume: 100 }),
      ];

      expect(sortKeywords(keywords, 'vol_asc').map((k) => k.ID)).toEqual([2, 3, 1]);
      expect(sortKeywords(keywords, 'vol_desc').map((k) => k.ID)).toEqual([1, 3, 2]);
   });

   it('sorts by Search Console metrics when provided', () => {
      const keywords = [
         buildKeyword({
            ID: 1,
            keyword: 'alpha',
            scData: { impressions: { thirtyDays: 10 }, visits: { thirtyDays: 5 } } as any,
         }),
         buildKeyword({
            ID: 2,
            keyword: 'bravo',
            scData: { impressions: { thirtyDays: 100 }, visits: { thirtyDays: 1 } } as any,
         }),
      ];

      expect(sortKeywords(keywords, 'imp_desc', 'thirtyDays').map((k) => k.ID)).toEqual([2, 1]);
      expect(sortKeywords(keywords, 'imp_asc', 'thirtyDays').map((k) => k.ID)).toEqual([1, 2]);
      expect(sortKeywords(keywords, 'visits_desc', 'thirtyDays').map((k) => k.ID)).toEqual([1, 2]);
      expect(sortKeywords(keywords, 'visits_asc', 'thirtyDays').map((k) => k.ID)).toEqual([2, 1]);
   });

   it('keeps sticky keywords at the top after other sorts', () => {
      const keywords = [
         buildKeyword({ ID: 1, keyword: 'bravo', sticky: true, added: '2024-01-03' }),
         buildKeyword({ ID: 2, keyword: 'alpha', sticky: false, added: '2024-01-01' }),
      ];

      expect(sortKeywords(keywords, 'date_asc').map((k) => k.ID)).toEqual([1, 2]);
   });
});
