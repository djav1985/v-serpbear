import { IdeasfilterKeywords, IdeasSortKeywords, matchesIdeaCountry, matchesIdeaSearch, matchesIdeaTags, normalizeIdeaTag } from '../../../utils/client/sortFilter';

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

   it('IdeasSortKeywords returns a new array and sorts competition descending for high competition', () => {
      const ideas = [
         createIdeaKeyword({ keyword: 'Low', competitionIndex: 0.1 }),
         createIdeaKeyword({ keyword: 'Medium', competitionIndex: 0.4 }),
         createIdeaKeyword({ keyword: 'High', competitionIndex: 0.8 }),
      ];

      const sorted = IdeasSortKeywords(ideas, 'competition_desc');

      expect(sorted.map((item) => item.keyword)).toEqual(['High', 'Medium', 'Low']);
      expect(sorted).not.toBe(ideas);
      expect(ideas[0].keyword).toBe('Low');
   });

   it('IdeasSortKeywords sorts ascending for low competition', () => {
      const ideas = [
         createIdeaKeyword({ keyword: 'Low', competitionIndex: 0.1 }),
         createIdeaKeyword({ keyword: 'Medium', competitionIndex: 0.4 }),
         createIdeaKeyword({ keyword: 'High', competitionIndex: 0.8 }),
      ];

      const sorted = IdeasSortKeywords(ideas, 'competition_asc');

      expect(sorted.map((item) => item.keyword)).toEqual(['Low', 'Medium', 'High']);
   });
});
