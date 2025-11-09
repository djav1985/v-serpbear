/// <reference path="../../types.d.ts" />

import { createKeywordCsvPayload, createKeywordIdeasCsvPayload } from '../../utils/client/exportcsv';

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

describe('CSV export utilities', () => {
   it('escapes tracked keyword exports that contain commas or quotes', () => {
      const keyword = {
         ID: 1,
         keyword: 'hello, "world"',
         position: 0,
         url: 'https://example.com/path,1',
         country: 'US',
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
      expect(parsedRow[4]).toBe('United States');
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
