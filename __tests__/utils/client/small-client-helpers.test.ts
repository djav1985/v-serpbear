import { safeHttpUrl } from '../../../utils/client/safeUrl';
import { SCfilterKeywords, SCkeywordsByDevice, SCsortKeywords , IdeasfilterKeywords, IdeasSortKeywords, matchesCountry, matchesSearch, matchesIdeaTags, normalizeIdeaTag } from '../../../utils/client/sortFilter';
import { toHistoryDateKey } from '../../../utils/historyDateKey';
import { generateTheChartData } from '../../../utils/client/generateChartData';

describe('safeUrl', () => {
describe('safeHttpUrl', () => {
   it('keeps http and https URLs', () => {
      expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
      expect(safeHttpUrl(' http://example.com ')).toBe('http://example.com');
   });

   it('rejects other schemes, relative values and empty input', () => {
      expect(safeHttpUrl('javascript:alert(1)')).toBe('');
      expect(safeHttpUrl('data:text/html,hi')).toBe('');
      expect(safeHttpUrl('/relative/path')).toBe('');
      expect(safeHttpUrl('')).toBe('');
      expect(safeHttpUrl(undefined)).toBe('');
      expect(safeHttpUrl(null)).toBe('');
   });
});
});

describe('SCsortFilter', () => {
describe('SCsortKeywords', () => {
   const createKeyword = (overrides: Partial<SCKeywordType>): SCKeywordType => ({
      uid: `${Math.random()}`,
      keyword: 'term',
      country: 'US',
      device: 'desktop',
      position: 10,
      impressions: 10,
      clicks: 1,
      ctr: 0.1,
      page: '/test',
      ...overrides,
   });

   it('sorts impression metrics asc/desc correctly', () => {
      const keywords = [
         createKeyword({ uid: 'a', impressions: 100 }),
         createKeyword({ uid: 'b', impressions: 10 }),
      ];
      expect(SCsortKeywords(keywords, 'imp_asc').map((k) => k.uid)).toEqual(['b', 'a']);
      expect(SCsortKeywords(keywords, 'imp_desc').map((k) => k.uid)).toEqual(['a', 'b']);
   });

   it('sorts visits asc/desc correctly', () => {
      const keywords = [
         createKeyword({ uid: 'a', clicks: 5 }),
         createKeyword({ uid: 'b', clicks: 20 }),
      ];
      expect(SCsortKeywords(keywords, 'visits_asc').map((k) => k.uid)).toEqual(['a', 'b']);
      expect(SCsortKeywords(keywords, 'visits_desc').map((k) => k.uid)).toEqual(['b', 'a']);
   });

   it('sorts ctr asc/desc correctly', () => {
      const keywords = [
         createKeyword({ uid: 'a', ctr: 0.05 }),
         createKeyword({ uid: 'b', ctr: 0.25 }),
      ];
      expect(SCsortKeywords(keywords, 'ctr_asc').map((k) => k.uid)).toEqual(['a', 'b']);
      expect(SCsortKeywords(keywords, 'ctr_desc').map((k) => k.uid)).toEqual(['b', 'a']);
   });

   it('sorts position asc/desc handling zero position gracefully', () => {
      const keywords = [
         createKeyword({ uid: 'a', position: 0 }),
         createKeyword({ uid: 'b', position: 3 }),
         createKeyword({ uid: 'c', position: 12 }),
      ];
      expect(SCsortKeywords(keywords, 'pos_asc').map((k) => k.uid)).toEqual(['b', 'c', 'a']);
      expect(SCsortKeywords(keywords, 'pos_desc').map((k) => k.uid)).toEqual(['a', 'c', 'b']);
   });

   it('sorts alphabetically', () => {
      const keywords = [
         createKeyword({ uid: 'a', keyword: 'zeta' }),
         createKeyword({ uid: 'b', keyword: 'alpha' }),
      ];
      expect(SCsortKeywords(keywords, 'alpha_asc').map((k) => k.uid)).toEqual(['b', 'a']);
      expect(SCsortKeywords(keywords, 'alpha_desc').map((k) => k.uid)).toEqual(['a', 'b']);
   });
});

describe('SCfilterKeywords', () => {
   const createKeyword = (overrides: Partial<SCKeywordType>): SCKeywordType => ({
      uid: `${Math.random()}`,
      keyword: 'Term',
      country: 'US',
      device: 'desktop',
      position: 10,
      impressions: 10,
      clicks: 1,
      ctr: 0.1,
      page: '/test',
      ...overrides,
   });

   it('filters by country and case-insensitive search text', () => {
      const keywords = [
         createKeyword({ uid: 'a', keyword: 'Alpha', country: 'US' }),
         createKeyword({ uid: 'b', keyword: 'alpha', country: 'GB' }),
         createKeyword({ uid: 'c', keyword: 'Beta', country: 'US' }),
      ];

      const filtered = SCfilterKeywords(keywords, {
         countries: ['US'],
         tags: [],
         search: 'Alpha',
      });

      expect(filtered.map((k) => k.uid)).toEqual(['a']);
   });

   it('matches search text regardless of case and surrounding whitespace', () => {
      const keywords = [
         createKeyword({ uid: 'a', keyword: 'Coffee Shops', country: 'US' }),
         createKeyword({ uid: 'b', keyword: 'tea', country: 'US' }),
      ];

      const filtered = SCfilterKeywords(keywords, {
         countries: ['US'],
         tags: [],
         search: '  COFFEE  ',
      });

      expect(filtered.map((k) => k.uid)).toEqual(['a']);

      // A whitespace-only search does not filter anything out
      const unfiltered = SCfilterKeywords(keywords, { countries: ['US'], tags: [], search: '   ' });
      expect(unfiltered.map((k) => k.uid)).toEqual(['a', 'b']);
   });
});

describe('SCkeywordsByDevice', () => {
   it('returns only keywords for the selected device', () => {
      const keywords: SCKeywordType[] = [
         {
            uid: 'a',
            keyword: 'Alpha',
            country: 'US',
            device: 'desktop',
            position: 1,
            impressions: 10,
            clicks: 1,
            ctr: 0.1,
            page: '/test',
         },
         {
            uid: 'b',
            keyword: 'Beta',
            country: 'US',
            device: 'mobile',
            position: 2,
            impressions: 20,
            clicks: 2,
            ctr: 0.2,
            page: '/test',
         },
      ];

      expect(SCkeywordsByDevice(keywords, 'desktop')).toEqual({ desktop: [keywords[0]], mobile: [] });
   });
});
});

describe('ideasSortFilter', () => {
describe('Ideas keyword filters', () => {
   const createIdeaKeyword = (overrides: Partial<IdeaKeyword> = {}) => ({
      keyword: 'Example Idea',
      country: 'US',
      avgMonthlySearches: 100,
      competitionIndex: 0.5,
      ...overrides,
   } as IdeaKeyword);

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

   it('IdeasSortKeywords sorts alphabetically in both directions ignoring case', () => {
      const ideas = [
         createIdeaKeyword({ keyword: 'banana' }),
         createIdeaKeyword({ keyword: 'Apple' }),
         createIdeaKeyword({ keyword: 'cherry' }),
      ];

      expect(IdeasSortKeywords(ideas, 'alpha_asc').map((item) => item.keyword)).toEqual(['Apple', 'banana', 'cherry']);
      expect(IdeasSortKeywords(ideas, 'alpha_desc').map((item) => item.keyword)).toEqual(['cherry', 'banana', 'Apple']);
      expect(ideas[0].keyword).toBe('banana');
   });
});
});

describe('generateChartData', () => {
/** Build a date-key string N days before today */
const daysAgo = (n: number): string => {
   const d = new Date();
   d.setDate(d.getDate() - n);
   return toHistoryDateKey(d);
};

describe('generateTheChartData', () => {
   describe('time-windowed mode', () => {
      it('returns a series with one entry per day including today', () => {
         const { labels, series } = generateTheChartData({}, '7');
         expect(labels).toHaveLength(7); // 6 days ago … today = 7 points
         expect(series).toHaveLength(7);
      });

      it('uses the actual position when history exists within the window', () => {
         const history: Record<string, number> = { [daysAgo(2)]: 5 };
         const { series } = generateTheChartData(history, '7');
         // The entry 2 days ago should be exactly 5
         expect(series[4]).toBe(5); // index 4 of 7 = (7-1)-2=4
      });

      it('carries the last known position forward for missing dates within the window', () => {
         const history: Record<string, number> = { [daysAgo(4)]: 10 };
         const { series } = generateTheChartData(history, '7');
         // index 2 = (7-1)-4 = 2 → 10; index 3+ should also be 10 (carry-forward)
         expect(series[2]).toBe(10);
         expect(series[3]).toBe(10);
         expect(series[6]).toBe(10); // today still carries 10
      });

      it('seeds lastFoundSerp from history before the window so chart is not blank', () => {
         // Keyword was ranked 10 days ago but only 0s in the last 7 days
         const history: Record<string, number> = {
            [daysAgo(10)]: 15,
            [daysAgo(3)]: 0,
            [daysAgo(1)]: 0,
         };
         const { series } = generateTheChartData(history, '7');
         // Without the seed fix all values would be 111 (blank chart).
         // With the fix, the seed = 15 so all non-positive entries use 15.
         expect(series.some((v) => v === 111)).toBe(false);
         expect(series.every((v) => v === 15)).toBe(true);
      });

      it('uses 111 for missing dates when there is no prior history at all', () => {
         const { series } = generateTheChartData({}, '7');
         expect(series.every((v) => v === 111)).toBe(true);
      });

      it('seeds from an entry exactly one day before the window start', () => {
         // With a 7-day window the oldest included day is daysAgo(6).
         // An entry at daysAgo(7) is just outside the window and must be used as seed.
         const history: Record<string, number> = {
            [daysAgo(7)]: 25,
            [daysAgo(3)]: 0,
         };
         const { series } = generateTheChartData(history, '7');
         expect(series.every((v) => v === 25)).toBe(true);
      });

      it('prefers more recent prior-history entry over an older one as the seed', () => {
         const history: Record<string, number> = {
            [daysAgo(20)]: 50,
            [daysAgo(10)]: 20, // more recent → should win
         };
         const { series } = generateTheChartData(history, '7');
         // Seed should be 20, so the 7-day window is filled with 20
         expect(series.every((v) => v === 20)).toBe(true);
      });

   });

   describe("'all' mode", () => {
      it('includes every history key', () => {
         const history: Record<string, number> = {
            '2024-1-1': 10,
            '2024-1-2': 15,
            '2024-1-3': 0,
         };
         const { labels, series } = generateTheChartData(history, 'all');
         expect(labels).toEqual(Object.keys(history));
         expect(series[0]).toBe(10);
         expect(series[1]).toBe(15);
         expect(series[2]).toBe(111); // 0 → 111 sentinel
      });
   });
});
});
