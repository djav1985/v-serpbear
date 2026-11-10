import { computeMapPackTop3, markOwnLocalResults } from '../../utils/mapPack';

describe('computeMapPackTop3', () => {
    const locals = [
      { position: 1, title: 'Acme Plumbing' },
      { position: 2, title: 'Other Co' },
      { position: 3, title: 'Third Ltd' },
      { position: 4, title: 'Fourth Inc' },
    ];

    it('matches the business name against the top three local results', () => {
      expect(computeMapPackTop3(locals, 'Acme Plumbing')).toBe(true);
      expect(computeMapPackTop3(locals, 'Third Ltd')).toBe(true);
      expect(computeMapPackTop3(locals, '  acme PLUMBING ')).toBe(true);
    });

    it('does not match a business ranked below third', () => {
      expect(computeMapPackTop3(locals, 'Fourth Inc')).toBe(false);
      const withUrl = [{ position: 1, title: 'Other Co', url: 'https://example.com' }];
      expect(computeMapPackTop3(withUrl, 'Acme Plumbing')).toBe(false);
    });

    it('returns false without a valid business name or local results', () => {
      expect(computeMapPackTop3(locals, null)).toBe(false);
      expect(computeMapPackTop3(locals, '   ')).toBe(false);
      expect(computeMapPackTop3([], 'Acme Plumbing')).toBe(false);
      expect(computeMapPackTop3(undefined, 'Acme Plumbing')).toBe(false);
    });

});

describe('map pack own result', () => {
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

     it('matches business names regardless of accents', () => {
        const listed = [{ position: 1, title: 'Café Crème' }, { position: 2, title: 'Other' }];
        expect(markOwnLocalResults(listed, 'Cafe Creme')[0].isOwn).toBe(true);
        expect(markOwnLocalResults([{ position: 1, title: 'Cafe Creme' }], 'Café Crème')[0].isOwn).toBe(true);
     });

     it('still matches when only spacing, punctuation or "&" differ', () => {
        const listed = [
           { position: 1, title: 'Smith &  Sons, Inc.' },
           { position: 2, title: 'Other' },
        ];
        expect(markOwnLocalResults(listed, 'smith and sons inc')[0].isOwn).toBe(true);
        expect(markOwnLocalResults(listed, "Smith & Sons Inc")[0].isOwn).toBe(true);
        expect(computeMapPackTop3(listed, 'Smith and Sons, Inc')).toBe(true);
        expect(markOwnLocalResults(listed, 'Smith Sons')[0].isOwn).toBe(false);
     });

     it('marks nothing without a business name, and copes with missing lists', () => {
        expect(markOwnLocalResults(results, '').every((entry) => entry.isOwn === false)).toBe(true);
        expect(markOwnLocalResults(results, null).every((entry) => entry.isOwn === false)).toBe(true);
        expect(markOwnLocalResults(undefined, 'Vontainment')).toEqual([]);
     });


     it('does not change the original entries', () => {
        markOwnLocalResults(results, 'Vontainment');
        expect(results[1]).toEqual({ position: 2, title: 'Vontainment' });
     });
  });
});
