import exportCSV, { createKeywordCsvPayload, createKeywordIdeasCsvPayload } from '../../../utils/client/exportcsv';

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
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
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
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
      expect(blobParts).toHaveLength(1);
      const csvContent = String(blobParts[0][0]);
      expect(csvContent).toMatch(/,"Unknown",/);
      // The download is plain UTF-8 with no byte order mark
      expect(csvContent.startsWith('﻿')).toBe(false);
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
