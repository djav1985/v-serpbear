import { matchesCountry, matchesSearch, matchesTags, NO_TAGS_FILTER, resolveTagSelection } from '../../../utils/client/sortFilter';

describe('keyword filter helpers', () => {
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

   it('matchesTags matches keywords without tags only when the no-tags option is selected', () => {
      expect(matchesTags([], [NO_TAGS_FILTER])).toBe(true);
      expect(matchesTags([], ['ppc'])).toBe(false);
      expect(matchesTags(['seo'], [NO_TAGS_FILTER])).toBe(false);
   });

   it('matchesTags combines the no-tags option with specific tags', () => {
      expect(matchesTags([], [NO_TAGS_FILTER, 'ppc'])).toBe(true);
      expect(matchesTags(['ppc'], [NO_TAGS_FILTER, 'ppc'])).toBe(true);
      expect(matchesTags(['seo'], [NO_TAGS_FILTER, 'ppc'])).toBe(false);
   });

   it('resolveTagSelection makes picking no-tags clear the other selections', () => {
      expect(resolveTagSelection(['seo'], ['seo', NO_TAGS_FILTER])).toEqual([NO_TAGS_FILTER]);
      expect(resolveTagSelection(['seo', 'ppc'], [NO_TAGS_FILTER, 'seo', 'ppc'])).toEqual([NO_TAGS_FILTER]);
   });

   it('resolveTagSelection drops no-tags when a specific tag is picked', () => {
      expect(resolveTagSelection([NO_TAGS_FILTER], [NO_TAGS_FILTER, 'seo'])).toEqual(['seo']);
   });

   it('resolveTagSelection keeps normal multi-tag selections and removing no-tags', () => {
      expect(resolveTagSelection(['seo'], ['seo', 'ppc'])).toEqual(['seo', 'ppc']);
      expect(resolveTagSelection([NO_TAGS_FILTER], [])).toEqual([]);
   });

});
