import { isValidEmail } from '../../../utils/client/validators';
import { getSelectedUntrackedKeywords } from '../../../utils/client/helpers';
import { NO_TAGS_FILTER, SCfilterKeywords, SCsortKeywords, matchesCountry, matchesIdeaTags, matchesSearch, matchesTags, normalizeIdeaTag, resolveTagSelection } from '../../../utils/client/sortFilter';
import { safeHttpUrl } from '../../../utils/client/safeUrl';
const createSCKeyword = (overrides: Partial<SCKeywordType> = {}): SCKeywordType => ({
  uid: 'fixture-keyword',
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

describe('isValidEmail', () => {
     it('accepts valid email addresses, including edge cases and surrounding whitespace', () => {
        expect(isValidEmail('user@example.com')).toBe(true);
        expect(isValidEmail('test.user@example.com')).toBe(true);
        expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
        expect(isValidEmail('user_name@example.org')).toBe(true);
        expect(isValidEmail('user-name@sub.example.com')).toBe(true);
        // TLD exactly 2 chars is valid, 1 char is not; short local/domain parts are valid
        expect(isValidEmail('user@example.co')).toBe(true);
        expect(isValidEmail('user@example.c')).toBe(false);
        expect(isValidEmail('a@b.com')).toBe(true);
        // whitespace is trimmed before validation
        expect(isValidEmail('  user@example.com  ')).toBe(true);
        expect(isValidEmail('\tuser@example.com\n')).toBe(true);
     });

     it('rejects invalid email addresses', () => {
        expect(isValidEmail('')).toBe(false);
        expect(isValidEmail('   ')).toBe(false);
        expect(isValidEmail('notanemail')).toBe(false);
        expect(isValidEmail('@example.com')).toBe(false);
        expect(isValidEmail('user@')).toBe(false);
        expect(isValidEmail('user@.com')).toBe(false);
        expect(isValidEmail('user@example')).toBe(false);
        expect(isValidEmail('user example@test.com')).toBe(false);
     });

     it('rejects non-string inputs', () => {
        expect(isValidEmail(null as unknown as string)).toBe(false);
        expect(isValidEmail(undefined as unknown as string)).toBe(false);
        expect(isValidEmail(123 as unknown as string)).toBe(false);
     });
  });

describe('getSelectedUntrackedKeywords', () => {
     it('filters keywords to include only selected and untracked items', () => {
        const keywords = [
           { uid: '1', keyword: 'keyword1', isTracked: false },
           { uid: '2', keyword: 'keyword2', isTracked: true },
           { uid: '3', keyword: 'keyword3', isTracked: false },
           { uid: '4', keyword: 'keyword4', isTracked: true },
        ];

        const selectedIds = ['1', '2', '3'];

        const result = getSelectedUntrackedKeywords(keywords, selectedIds);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ uid: '1', isTracked: false });
        expect(result[1]).toMatchObject({ uid: '3', isTracked: false });
     });

     it('returns empty array when no keywords are selected or when all selected keywords are tracked', () => {
        const keywords = [
           { uid: '1', keyword: 'keyword1', isTracked: false },
           { uid: '2', keyword: 'keyword2', isTracked: true },
        ];

        expect(getSelectedUntrackedKeywords(keywords, [])).toHaveLength(0);

        const trackedOnly = [
           { uid: '1', keyword: 'keyword1', isTracked: true },
           { uid: '2', keyword: 'keyword2', isTracked: true },
        ];
        expect(getSelectedUntrackedKeywords(trackedOnly, ['1', '2'])).toHaveLength(0);
     });

     it('returns all selected keywords when none are tracked', () => {
        const keywords = [
           { uid: '1', keyword: 'keyword1', isTracked: false },
           { uid: '2', keyword: 'keyword2', isTracked: false },
           { uid: '3', keyword: 'keyword3', isTracked: false },
        ];

        const selectedIds = ['1', '3'];

        const result = getSelectedUntrackedKeywords(keywords, selectedIds);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ uid: '1', isTracked: false });
        expect(result[1]).toMatchObject({ uid: '3', isTracked: false });
     });

     it('handles keywords with additional properties', () => {
        interface ExtendedKeyword {
           uid: string;
           isTracked: boolean;
           keyword: string;
           country: string;
           competition: string;
        }

        const keywords: ExtendedKeyword[] = [
           { uid: '1', keyword: 'test1', isTracked: false, country: 'US', competition: 'HIGH' },
           { uid: '2', keyword: 'test2', isTracked: true, country: 'CA', competition: 'LOW' },
        ];

        const selectedIds = ['1', '2'];

        const result = getSelectedUntrackedKeywords(keywords, selectedIds);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
           uid: '1',
           isTracked: false,
           keyword: 'test1',
           country: 'US',
           competition: 'HIGH',
        });
     });
  });

describe('sort and filter', () => {
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
});

describe('search console sort and filter', () => {
  describe('SCsortKeywords', () => {
     it('sorts impression metrics asc/desc correctly', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', impressions: 100 }),
           createSCKeyword({ uid: 'b', impressions: 10 }),
        ];
        expect(SCsortKeywords(keywords, 'imp_asc').map((k) => k.uid)).toEqual(['b', 'a']);
        expect(SCsortKeywords(keywords, 'imp_desc').map((k) => k.uid)).toEqual(['a', 'b']);
     });

     it('sorts visits asc/desc correctly', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', clicks: 5 }),
           createSCKeyword({ uid: 'b', clicks: 20 }),
        ];
        expect(SCsortKeywords(keywords, 'visits_asc').map((k) => k.uid)).toEqual(['a', 'b']);
        expect(SCsortKeywords(keywords, 'visits_desc').map((k) => k.uid)).toEqual(['b', 'a']);
     });

     it('sorts ctr asc/desc correctly', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', ctr: 0.05 }),
           createSCKeyword({ uid: 'b', ctr: 0.25 }),
        ];
        expect(SCsortKeywords(keywords, 'ctr_asc').map((k) => k.uid)).toEqual(['a', 'b']);
        expect(SCsortKeywords(keywords, 'ctr_desc').map((k) => k.uid)).toEqual(['b', 'a']);
     });

     it('sorts position asc/desc handling zero position gracefully', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', position: 0 }),
           createSCKeyword({ uid: 'b', position: 3 }),
           createSCKeyword({ uid: 'c', position: 12 }),
        ];
        expect(SCsortKeywords(keywords, 'pos_asc').map((k) => k.uid)).toEqual(['b', 'c', 'a']);
        expect(SCsortKeywords(keywords, 'pos_desc').map((k) => k.uid)).toEqual(['a', 'c', 'b']);
     });

     it('sorts alphabetically', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', keyword: 'zeta' }),
           createSCKeyword({ uid: 'b', keyword: 'alpha' }),
        ];
        expect(SCsortKeywords(keywords, 'alpha_asc').map((k) => k.uid)).toEqual(['b', 'a']);
        expect(SCsortKeywords(keywords, 'alpha_desc').map((k) => k.uid)).toEqual(['a', 'b']);
     });
  });

  describe('SCfilterKeywords', () => {
     it('filters by country and case-insensitive search text', () => {
        const keywords = [
           createSCKeyword({ uid: 'a', keyword: 'Alpha', country: 'US' }),
           createSCKeyword({ uid: 'b', keyword: 'alpha', country: 'GB' }),
           createSCKeyword({ uid: 'c', keyword: 'Beta', country: 'US' }),
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
           createSCKeyword({ uid: 'a', keyword: 'Coffee Shops', country: 'US' }),
           createSCKeyword({ uid: 'b', keyword: 'tea', country: 'US' }),
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
});

describe('idea filters', () => {
  describe('Ideas keyword filters', () => {
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
});

describe('safe url', () => {
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
