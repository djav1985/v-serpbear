/// <reference path="../../../types.d.ts" />

import { calculateChartBounds } from '../../../utils/client/chartBounds';
import { isValidEmail } from '../../../utils/client/validators';
import { formattedNum, getSelectedUntrackedKeywords } from '../../../utils/client/helpers';
import { aggregateSCKeywords } from '../../../pages/domain/console/[slug]/index';
import exportCSV, { createKeywordCsvPayload, createKeywordIdeasCsvPayload } from '../../../utils/client/exportcsv';
import { serializeForScript } from '../../../utils/api/scriptJson';

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
   it('accepts valid email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(isValidEmail('user_name@example.org')).toBe(true);
      expect(isValidEmail('user-name@sub.example.com')).toBe(true);
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

   it('handles edge cases', () => {
      expect(isValidEmail('user@example.c')).toBe(false); // TLD too short
      expect(isValidEmail('user@example.co')).toBe(true); // TLD exactly 2 chars
      expect(isValidEmail('a@b.com')).toBe(true); // Short but valid
   });

   it('trims whitespace before validation', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
      expect(isValidEmail('\tuser@example.com\n')).toBe(true);
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

   it('returns empty array when no keywords are selected', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: false },
         { uid: '2', keyword: 'keyword2', isTracked: true },
      ];

      const result = getSelectedUntrackedKeywords(keywords, []);

      expect(result).toHaveLength(0);
   });

   it('returns empty array when all selected keywords are tracked', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: true },
         { uid: '2', keyword: 'keyword2', isTracked: true },
      ];

      const selectedIds = ['1', '2'];

      const result = getSelectedUntrackedKeywords(keywords, selectedIds);

      expect(result).toHaveLength(0);
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
  it('escapes tracked keyword exports that contain commas or quotes', () => {
    const keyword = {
      ID: 1,
      keyword: 'hello, "world"',
      position: 0,
      url: 'https://example.com/path,1',
      country: 'ZZ',
      state: '',
      city: '',
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

    const [row] = payload!.body.trim().split('\n');
    const parsedRow = parseCsvRow(row);

    expect(parsedRow[0]).toBe('1');
    expect(parsedRow[1]).toBe('hello, "world"');
    expect(parsedRow[2]).toBe('-');
    expect(parsedRow[3]).toBe('https://example.com/path,1');
    expect(parsedRow[4]).toBe('Unknown');
    expect(parsedRow[10]).toBe('tag,one,tag"two');
  });

  it('escapes keyword idea exports and preserves quotes and commas', () => {
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

    const payload = createKeywordIdeasCsvPayload(keywordIdeas, 'example.com');
    expect(payload).not.toBeNull();

    const [row] = payload!.body.trim().split('\n');
    const parsedRow = parseCsvRow(row);

    expect(parsedRow[0]).toBe('alpha, "beta"');
    expect(parsedRow[1]).toBe('500');
    expect(parsedRow[2]).toBe('HIGH');
    expect(parsedRow[3]).toBe('75');
    expect(parsedRow[4]).toBe('AA');
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
