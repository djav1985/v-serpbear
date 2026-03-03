import parseKeywords from '../../utils/parseKeywords';

describe('parseKeywords', () => {
   const buildKeyword = (overrides: Partial<Record<string, any>> = {}) => ({
      ID: 1,
      keyword: 'example keyword',
      device: 'desktop',
      country: 'US',
      domain: 'example.com',
      lastUpdated: '2025-01-01T00:00:00.000Z',
      added: '2025-01-01T00:00:00.000Z',
      position: 5,
      volume: 100,
      sticky: 1,
      history: JSON.stringify({ '2025-01-01': 5 }),
      lastResult: JSON.stringify([]),
      url: 'https://example.com/page',
      tags: JSON.stringify(['tag']),
      updating: 0,
      lastUpdateError: 'false',
      mapPackTop3: 0,
      ...overrides,
   });

   it('returns false for falsy integer values', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ updating: 0, sticky: 0, mapPackTop3: 0 }) as any,
      ]);

      expect(keyword.updating).toBe(false);
      expect(keyword.sticky).toBe(false);
      expect(keyword.mapPackTop3).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(keyword, 'mapPackTop3')).toBe(true);
   });

   it('returns true for truthy integer values', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ updating: 1, sticky: 1, mapPackTop3: 1 }) as any,
      ]);

      expect(keyword.updating).toBe(true);
      expect(keyword.sticky).toBe(true);
      expect(keyword.mapPackTop3).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(keyword, 'mapPackTop3')).toBe(true);
   });

   it('keeps existing keyword structure intact', () => {
      const [keyword] = parseKeywords([buildKeyword({ updating: 0 }) as any]);

      expect(keyword.history).toEqual({ '2025-01-01': 5 });
      expect(keyword.tags).toEqual(['tag']);
      expect(keyword.lastResult).toEqual([]);
      expect(keyword.location).toBe('');
   });

   it('returns false for missing mapPackTop3 flag', () => {
      const [{ mapPackTop3 }] = parseKeywords([
         buildKeyword({ mapPackTop3: undefined }) as any,
      ]);

      expect(mapPackTop3).toBe(false);
   });

   it('parses a valid history7d JSON string into a KeywordHistory object', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ history7d: JSON.stringify({ '2025-01-01': 3, '2025-01-02': 4 }) }) as any,
      ]);

      expect(keyword.history7d).toEqual({ '2025-01-01': 3, '2025-01-02': 4 });
   });

   it('leaves history7d as null on the result when the field is null (not backfilled)', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ history7d: null }) as any,
      ]);

      expect(keyword.history7d).toBeNull();
   });

   it('omits history7d from the result when the field is missing', () => {
      const base = buildKeyword() as any;
      delete base.history7d;
      const [keyword] = parseKeywords([base]);

      expect(Object.prototype.hasOwnProperty.call(keyword, 'history7d')).toBe(false);
   });

   it('falls back to an empty KeywordHistory when history7d contains invalid JSON', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ history7d: 'not-valid-json' }) as any,
      ]);

      expect(keyword.history7d).toEqual({});
   });
});
