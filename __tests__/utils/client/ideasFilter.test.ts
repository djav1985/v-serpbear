import { matchesCountry, matchesSearch, matchesIdeaTags, normalizeIdeaTag } from '../../../utils/client/sortFilter';

describe('Ideas keyword filters', () => {
   it('matchesCountry matches configured countries', () => {
      expect(matchesCountry('US', [])).toBe(true);
      expect(matchesCountry('US', ['US'])).toBe(true);
      expect(matchesCountry('US', ['GB'])).toBe(false);
   });

   it('matchesSearch runs case insensitive search', () => {
      expect(matchesSearch('Amazing Keyword Idea', '')).toBe(true);
      expect(matchesSearch('Amazing Keyword Idea', 'keyword')).toBe(true);
      expect(matchesSearch('Amazing Keyword Idea', 'IDEA')).toBe(true);
      expect(matchesSearch('Amazing Keyword Idea', 'other')).toBe(false);
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

});
