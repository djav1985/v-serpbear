import { filterKeywords, matchesCountry, matchesSearch, matchesTags } from '../../../app/utils/client/sortFilter';

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
