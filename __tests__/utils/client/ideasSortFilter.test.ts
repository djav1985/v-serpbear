import { IdeasfilterKeywords, matchesIdeaCountry, matchesIdeaSearch, matchesIdeaTags, normalizeIdeaTag } from '../../../app/utils/client/IdeasSortFilter';

describe('Ideas keyword filters', () => {
   const createIdeaKeyword = (overrides: Partial<IdeaKeyword> = {}): IdeaKeyword => ({
      text: 'Example Idea',
      keyword: 'Example Idea',
      country: 'US',
      avgMonthlySearches: 100,
      competitionIndex: 0.5,
      ...overrides,
   });

   it('matchesIdeaCountry matches configured countries', () => {
      expect(matchesIdeaCountry('US', [])).toBe(true);
      expect(matchesIdeaCountry('US', ['US'])).toBe(true);
      expect(matchesIdeaCountry('US', ['GB'])).toBe(false);
   });

   it('matchesIdeaSearch runs case insensitive search', () => {
      expect(matchesIdeaSearch('Amazing Keyword Idea', '')).toBe(true);
      expect(matchesIdeaSearch('Amazing Keyword Idea', 'keyword')).toBe(true);
      expect(matchesIdeaSearch('Amazing Keyword Idea', 'IDEA')).toBe(true);
      expect(matchesIdeaSearch('Amazing Keyword Idea', 'other')).toBe(false);
   });

   it('normalizeIdeaTag trims counts and whitespace', () => {
      expect(normalizeIdeaTag('SEO (12)')).toBe('SEO');
      expect(normalizeIdeaTag('   local search   ')).toBe('local search');
   });

   it('matchesIdeaTags checks original and reversed tag order', () => {
      expect(matchesIdeaTags('local seo tips', [])).toBe(true);
      expect(matchesIdeaTags('local seo tips', ['Local SEO (10)'])).toBe(true);
      expect(matchesIdeaTags('tips for seo local', ['Local SEO'])).toBe(true);
      expect(matchesIdeaTags('ppc guide', ['local seo'])).toBe(false);
   });

   it('IdeasfilterKeywords filters with all predicates', () => {
      const ideas = [
         createIdeaKeyword({ keyword: 'Local SEO Tips', country: 'US' }),
         createIdeaKeyword({ keyword: 'Global PPC Strategy', country: 'GB' }),
         createIdeaKeyword({ keyword: 'SEO Local Tips', country: 'US' }),
      ];

      const filtered = IdeasfilterKeywords(ideas, {
         countries: ['US'],
         search: 'seo',
         tags: ['Local SEO (5)'],
      });

      expect(filtered).toHaveLength(2);
      expect(filtered.map((item) => item.keyword)).toEqual(['Local SEO Tips', 'SEO Local Tips']);
   });
});
