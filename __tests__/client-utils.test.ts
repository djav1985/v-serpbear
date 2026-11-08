import { ApiError, apiDelete, apiFetch, apiGet, apiPost, apiPut } from '../utils/client/apiClient';
import { calculateChartBounds } from '../utils/client/chartBounds';
import { isValidEmail } from '../utils/client/validators';
import { formattedNum, getSelectedUntrackedKeywords } from '../utils/client/helpers';
import { aggregateSCKeywords } from '../app/(dashboard)/domain/console/[slug]/_components/sc-state';
import exportCSV, { createKeywordCsvPayload, createKeywordIdeasCsvPayload } from '../utils/client/exportcsv';
import { serializeForScript } from '../utils/api/scriptJson';
import { NO_TAGS_FILTER, SCfilterKeywords, SCsortKeywords, matchesCountry, matchesIdeaTags, matchesSearch, matchesTags, normalizeIdeaTag, resolveTagSelection } from '../utils/client/sortFilter';
import { safeHttpUrl } from '../utils/client/safeUrl';
import { toHistoryDateKey } from '../utils/historyDateKey';
import { generateTheChartData } from '../utils/client/generateChartData';

const mockOrigin = 'http://localhost:3000';
jest.mock('../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

describe('api client', () => {
  describe('ApiError', () => {
     it('constructs with statusCode, code, and optional requestId', () => {
        const err = new ApiError('Not found', 404, 'NOT_FOUND', 'req-1');
        expect(err.message).toBe('Not found');
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('NOT_FOUND');
        expect(err.requestId).toBe('req-1');
        expect(err.name).toBe('ApiError');
     });

     it('requestId is optional', () => {
        const err = new ApiError('Bad request', 400, 'BAD_REQUEST');
        expect(err.requestId).toBeUndefined();
     });
  });

  describe('apiFetch', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        global.fetch = jest.fn() as unknown as typeof fetch;
     });

     afterEach(() => {
        global.fetch = originalFetch;
        (global.fetch as unknown as jest.Mock)?.mockReset?.();
     });

     const mockFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status,
           ok: status >= 200 && status < 300,
           headers: {
              get: (name: string) => headers[name] ?? null,
           },
           json: jest.fn().mockResolvedValue(body),
           text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : ''),
        });
     };

     it('returns parsed JSON body on successful response', async () => {
        mockFetch(200, { domains: [] }, { 'content-type': 'application/json' });
        const result = await apiFetch('/api/serp/domains');
        expect(result).toEqual({ domains: [] });
     });

     it('throws ApiError with structured message on failure envelope', async () => {
        mockFetch(404, { error: { code: 'NOT_FOUND', message: 'Domain not found' }, requestId: 'rid-1' }, { 'content-type': 'application/json' });

        await expect(apiFetch('/api/serp/domain?domain=missing')).rejects.toMatchObject({
           message: 'Domain not found',
           statusCode: 404,
           code: 'NOT_FOUND',
        });
     });

     it('throws ApiError with legacy string error on old-format responses', async () => {
        mockFetch(400, { error: 'Bad request legacy' }, { 'content-type': 'application/json' });

        await expect(apiFetch('/api/something')).rejects.toMatchObject({
           message: 'Bad request legacy',
           statusCode: 400,
        });
     });

     it('propagates X-Request-Id from response headers into ApiError', async () => {
        mockFetch(500, { error: { code: 'SERVER_ERROR', message: 'Boom' } }, { 'content-type': 'application/json', 'X-Request-Id': 'req-xyz' });

        let caughtError: ApiError | undefined;
        try {
           await apiFetch('/api/fail');
        } catch (e) {
           caughtError = e as ApiError;
        }
        expect(caughtError?.requestId).toBe('req-xyz');
     });

     it('falls back to generic message for non-JSON error response', async () => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status: 503,
           ok: false,
           headers: { get: () => 'text/html' },
           json: jest.fn().mockRejectedValue(new Error('not json')),
           text: jest.fn().mockResolvedValue('<html>Service Unavailable</html>'),
        });

        await expect(apiFetch('/api/fail')).rejects.toMatchObject({
           message: 'Server error (503): Please try again later',
        });
     });
  });

  describe('HTTP verb helpers', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        global.fetch = jest.fn() as unknown as typeof fetch;
     });

     afterEach(() => {
        global.fetch = originalFetch;
        (global.fetch as unknown as jest.Mock)?.mockReset?.();
     });

     const mockSuccess = (body: unknown) => {
        const fetchMock = global.fetch as unknown as jest.Mock;
        fetchMock.mockResolvedValueOnce({
           status: 200,
           ok: true,
           headers: { get: () => null },
           json: jest.fn().mockResolvedValue(body),
        });
     };

     it('apiGet calls fetch with GET method', async () => {
        mockSuccess({ ok: true });
        await apiGet('/api/test');
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({ method: 'GET' }));
     });

     it('apiPost calls fetch with POST method and serialized body', async () => {
        mockSuccess({ ok: true });
        await apiPost('/api/test', { key: 'value' });
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({
           method: 'POST',
           body: JSON.stringify({ key: 'value' }),
        }));
     });

     it('apiPut calls fetch with PUT method and serialized body', async () => {
        mockSuccess({ ok: true });
        await apiPut('/api/test', { update: true });
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({
           method: 'PUT',
           body: JSON.stringify({ update: true }),
        }));
     });

     it('apiDelete calls fetch with DELETE method', async () => {
        mockSuccess({ ok: true });
        await apiDelete('/api/test');
        const fetchMock = global.fetch as unknown as jest.Mock;
        expect(fetchMock).toHaveBeenCalledWith(`${mockOrigin}/api/test`, expect.objectContaining({ method: 'DELETE' }));
     });
  });
});

describe('client helpers', () => {
  /// <reference path="../../../types.d.ts" />


  describe('calculateChartBounds', () => {
     it('returns default bounds when no valid points are provided', () => {
        expect(calculateChartBounds([0, 111, NaN])).toEqual({ min: 1, max: 100 });
     });

     it('applies padding around the min and max values for rank charts', () => {
        const bounds = calculateChartBounds([10, 20, 30]);
        expect(bounds).toEqual({ min: 8, max: 32 });
     });

     it('ensures min and max differ when all values are identical', () => {
        const bounds = calculateChartBounds([5, 5, 5]);
        expect(bounds.min).toBeLessThan(bounds.max as number);
        expect(bounds).toEqual({ min: 4, max: 6 });
     });

     it('supports forward charts without enforcing a 100 ceiling', () => {
        const bounds = calculateChartBounds([50, 75, 90], { reverse: false, noMaxLimit: true });
        expect(bounds).toEqual({ min: 46, max: 94 });
     });
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

  /**
   * CSV export behavior tests: payload formatting (createKeywordCsvPayload /
   * createKeywordIdeasCsvPayload) and Blob/download path via exportCSV.
   */

  const parseCsvRow = (row: string): string[] => {
    const sanitizedRow = row.replace(/\r?$/, '');
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < sanitizedRow.length; i += 1) {
      const char = sanitizedRow[i];
      if (char === '"') {
        if (inQuotes && sanitizedRow[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  };

  // ---------------------------------------------------------------------------
  // Payload formatting
  // ---------------------------------------------------------------------------

  describe('CSV payload formatting', () => {
    it('escapes commas and quotes in tracked keyword and keyword idea exports', () => {
      const keyword = {
        ID: 1,
        keyword: 'hello, "world"',
        position: 0,
        url: 'https://example.com/path,1',
        location: 'Austin, Texas, United States',
        country: 'US',
        device: 'desktop',
        lastUpdated: '2024-01-01',
        added: '2024-01-02',
        tags: ['tag,one', 'tag"two'],
        domain: 'example.com',
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        updating: false,
        lastUpdateError: false,
      } as unknown as KeywordType;

      const payload = createKeywordCsvPayload([keyword], 'example.com');
      expect(payload).not.toBeNull();
      expect(payload!.header).toBe('ID,Keyword,Map Pack,Position,URL,Country,Location,Device,Updated,Added,Tags\r\n');

      const [row] = payload!.body.trim().split('\n');
      const parsedRow = parseCsvRow(row);

      expect(parsedRow[0]).toBe('1');
      expect(parsedRow[1]).toBe('hello, "world"');
      expect(parsedRow[2]).toBe('0');
      expect(parsedRow[3]).toBe('-');
      expect(parsedRow[4]).toBe('https://example.com/path,1');
      expect(parsedRow[5]).toBe('United States');
      expect(parsedRow[6]).toBe('Austin, Texas, United States');
      expect(parsedRow[10]).toBe('tag,one,tag"two');

      // Map Pack column: 0 outside the top 3, the spot (1..3) inside it, empty when the spot cannot be read
      const ownResult = (spot: number) => [{ position: spot, isOwn: true }, { position: 4, isOwn: false }];
      const mapPackRows = createKeywordCsvPayload([
        { ...keyword, ID: 1, mapPackTop3: false, localResults: ownResult(1) },
        { ...keyword, ID: 2, mapPackTop3: true, localResults: ownResult(1) },
        { ...keyword, ID: 3, mapPackTop3: true, localResults: ownResult(2) },
        { ...keyword, ID: 4, mapPackTop3: true, localResults: ownResult(3) },
        { ...keyword, ID: 5, mapPackTop3: true, localResults: [] },
      ] as unknown as KeywordType[], 'example.com');
      const mapPackCells = mapPackRows!.body.trim().split('\n').map((line) => parseCsvRow(line)[2]);
      expect(mapPackCells).toEqual(['0', '1', '2', '3', '']);

      // keyword idea export preserves quotes and commas as well
      const keywordIdeas: IdeaKeyword[] = [
        {
          uid: 'idea-1',
          keyword: 'alpha, "beta"',
          competition: 'HIGH',
          competitionIndex: 75,
          avgMonthlySearches: 500,
          monthlySearchVolumes: { '2024-01': '500' },
          country: 'AA',
          domain: 'example.com',
          added: new Date('2024-01-10').getTime(),
          updated: new Date('2024-01-10').getTime(),
          position: 0,
        },
      ];

      const ideaPayload = createKeywordIdeasCsvPayload(keywordIdeas, 'example.com');
      expect(ideaPayload).not.toBeNull();

      const [ideaRow] = ideaPayload!.body.trim().split('\n');
      const parsedIdeaRow = parseCsvRow(ideaRow);

      expect(parsedIdeaRow[0]).toBe('alpha, "beta"');
      expect(parsedIdeaRow[1]).toBe('500');
      expect(parsedIdeaRow[2]).toBe('HIGH');
      expect(parsedIdeaRow[3]).toBe('75');
      expect(parsedIdeaRow[4]).toBe('AA');
    });
  });

  // ---------------------------------------------------------------------------
  // Blob / download path (exportCSV – SC keywords)
  // ---------------------------------------------------------------------------

  describe('exportCSV Blob and download path', () => {
    const OriginalBlob = global.Blob;
    const blobParts: unknown[][] = [];

    beforeEach(() => {
      blobParts.length = 0;
      // @ts-expect-error - Mock Blob for capturing CSV content
      global.Blob = class MockBlob {
        public parts: unknown[];
        constructor(parts: unknown[], _options?: unknown) {
          this.parts = parts;
          blobParts.push(parts);
        }
      };
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('mock-url');
    });

    afterEach(() => {
      jest.restoreAllMocks();
      global.Blob = OriginalBlob;
    });

    it('falls back to the raw country code when the Search Console country is unknown', () => {
      const keywords: SCKeywordType[] = [
        {
          keyword: 'example keyword',
          uid: 'abc123',
          device: 'desktop',
          page: '/example',
          country: 'ZZ',
          clicks: 5,
          impressions: 50,
          ctr: 0.1,
          position: 3,
        },
      ];

      expect(() => exportCSV(keywords, 'example.com')).not.toThrow();
      expect(blobParts).toHaveLength(1);
      const csvContent = String(blobParts[0][0]);
      expect(csvContent).toMatch(/,"Unknown",/);
      // The download is plain UTF-8 with no byte order mark
      expect(csvContent.startsWith('﻿')).toBe(false);
    });
  });

  describe('serializeForScript', () => {
    it('never emits a raw "</script>" that would end an inline script early', () => {
      const output = serializeForScript({ message: '</script><script>alert(1)</script>' });

      expect(output).not.toContain('</script>');
      expect(output).not.toContain('<');
      expect(output).not.toContain('>');
    });

    it('round-trips through JSON.parse back to the original value', () => {
      const separators = `${String.fromCharCode(0x2028)} ${String.fromCharCode(0x2029)}`;
      const value = {
        message: `a < b && c > d </script> ${separators} "quoted"`,
        status: 'error',
        nested: { list: ['<img src=x onerror=alert(1)>'] },
      };

      expect(JSON.parse(serializeForScript(value))).toEqual(value);
    });

    it('serializes plain values the same way JSON.stringify does', () => {
      expect(serializeForScript({ ok: true, count: 2 })).toBe('{"ok":true,"count":2}');
      expect(serializeForScript('/settings?ads=integrated')).toBe('"/settings?ads=integrated"');
    });
  });

  describe('formattedNum and Search Console aggregation', () => {
    it('groups thousands without dropping digits and keeps small values at 3 significant digits', () => {
      expect(formattedNum(12345)).toBe('12,345');
      expect(formattedNum(1234567)).toBe('1,234,567');
      expect(formattedNum(999)).toBe('999');
      expect(formattedNum(1.2345)).toBe('1.23');
    });

    it('weights position by impressions, computes CTR from totals, and guards zero impressions', () => {
      const row = (date: string, clicks: number, impressions: number, position: number, keyword = 'kw') => ({
        uid: `u-${date}`, keyword, device: 'desktop', country: 'USA', page: '/',
        clicks, impressions, ctr: 0, position, date,
      }) as unknown as SearchAnalyticsItem;

      const [grouped, empty] = aggregateSCKeywords([
        row('d1', 10, 100, 1),
        row('d2', 0, 900, 10),
        row('d1', 0, 0, 2, 'none'),
        row('d2', 0, 0, 4, 'none'),
      ]);

      expect(grouped.clicks).toBe(10);
      expect(grouped.impressions).toBe(1000);
      expect(grouped.ctr).toBe(1); // 10 / 1000 = 1%, not the mean of per-row CTRs
      expect(grouped.position).toBe(9); // (1*100 + 10*900) / 1000 = 9.1
      expect(empty.ctr).toBe(0);
      expect(empty.position).toBe(3); // plain average when there are no impressions
    });
  });

  describe('Search Console CSV payload', () => {
     it('numbers rows from 1 under a "#" header instead of an ID column', () => {
        const payload = createKeywordCsvPayload([
           { uid: 'a', keyword: 'one', position: 3, impressions: 10, clicks: 1, ctr: 10, country: 'US', device: 'desktop' },
           { uid: 'b', keyword: 'two', position: 0, impressions: 5, clicks: 0, ctr: 0, country: 'US', device: 'mobile' },
        ] as unknown as SCKeywordType[], 'example.com', 'thirtyDays');
        expect(payload!.header).toBe('#,Keyword,Position,Impressions,Clicks,CTR,Country,Device\r\n');
        const rows = payload!.body.trim().split('\n');
        expect(parseCsvRow(rows[0])[0]).toBe('1');
        expect(parseCsvRow(rows[1])[0]).toBe('2');
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
});

describe('idea filters', () => {
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

describe('chart data', () => {
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

describe('conflictMessage', () => {
  const { ApiError, conflictMessage } = require('../utils/client/apiClient');

  it('shows the server message for a 409 and the fallback for anything else', () => {
    expect(conflictMessage(new ApiError('Try again once the refresh has finished.', 409, 'CONFLICT'), 'Error')).toBe('Try again once the refresh has finished.');
    expect(conflictMessage(new ApiError('Server error', 500, 'INTERNAL_SERVER_ERROR'), 'Error removing the keywords')).toBe('Error removing the keywords');
    expect(conflictMessage(new ApiError('   ', 409, 'CONFLICT'), 'Error')).toBe('Error');
    expect(conflictMessage(new Error('network down'), 'Error')).toBe('Error');
  });
});
