import { computeMapPackTop3, markOwnLocalResults } from '../../utils/mapPack';

describe('markOwnLocalResults', () => {
   const results = [
      { position: 1, title: 'CeJay Websites' },
      { position: 2, title: 'Vontainment' },
      { position: 3, title: 'US Web Central' },
      { position: 4, title: 'Vontainment' },
   ];

   it('marks only the top-3 entry whose title equals the business name, ignoring case and spaces', () => {
      const out = markOwnLocalResults(results, '  vontainment ');
      expect(out.map((entry) => entry.isOwn)).toEqual([false, true, false, false]);
   });

   it('marks nothing without a business name, and copes with missing lists', () => {
      expect(markOwnLocalResults(results, '').every((entry) => entry.isOwn === false)).toBe(true);
      expect(markOwnLocalResults(results, null).every((entry) => entry.isOwn === false)).toBe(true);
      expect(markOwnLocalResults(undefined, 'Vontainment')).toEqual([]);
   });

   it('agrees with computeMapPackTop3 on whether anything matches', () => {
      for (const name of ['Vontainment', 'Other Co', '']) {
         expect(markOwnLocalResults(results, name).some((entry) => entry.isOwn)).toBe(computeMapPackTop3(results, name));
      }
   });

   it('does not change the original entries', () => {
      markOwnLocalResults(results, 'Vontainment');
      expect(results[1]).toEqual({ position: 2, title: 'Vontainment' });
   });
});
