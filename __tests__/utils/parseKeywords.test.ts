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

   it('converts integer flags to booleans and defaults a missing mapPackTop3 to false', () => {
      const [falsy] = parseKeywords([
         buildKeyword({ updating: 0, sticky: 0, mapPackTop3: 0 }) as any,
      ]);
      expect(falsy.updating).toBe(false);
      expect(falsy.sticky).toBe(false);
      expect(falsy.mapPackTop3).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(falsy, 'mapPackTop3')).toBe(true);

      const [truthy] = parseKeywords([
         buildKeyword({ updating: 1, sticky: 1, mapPackTop3: 1 }) as any,
      ]);
      expect(truthy.updating).toBe(true);
      expect(truthy.sticky).toBe(true);
      expect(truthy.mapPackTop3).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(truthy, 'mapPackTop3')).toBe(true);

      const [missing] = parseKeywords([
         buildKeyword({ mapPackTop3: undefined }) as any,
      ]);
      expect(missing.mapPackTop3).toBe(false);
   });

   it('keeps existing keyword structure intact', () => {
      const [keyword] = parseKeywords([buildKeyword({ updating: 0 }) as any]);

      expect(keyword.history).toEqual({ '2025-01-01': 5 });
      expect(keyword.tags).toEqual(['tag']);
      expect(keyword.lastResult).toEqual([]);
      expect(keyword.location).toBe('');
   });

   it('parses a valid history7d JSON string into a KeywordHistory object', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ history7d: JSON.stringify({ '2025-01-01': 3, '2025-01-02': 4 }) }) as any,
      ]);

      expect(keyword.history7d).toEqual({ '2025-01-01': 3, '2025-01-02': 4 });
   });

   it('leaves a null history7d as null (not backfilled) and omits history7d when the field is missing', () => {
      const [withNull] = parseKeywords([
         buildKeyword({ history7d: null }) as any,
      ]);
      expect(withNull.history7d).toBeNull();

      const base = buildKeyword() as any;
      delete base.history7d;
      const [withoutField] = parseKeywords([base]);
      expect(Object.prototype.hasOwnProperty.call(withoutField, 'history7d')).toBe(false);
   });

   it('falls back to an empty KeywordHistory when history7d contains invalid JSON', () => {
      const [keyword] = parseKeywords([
         buildKeyword({ history7d: 'not-valid-json' }) as any,
      ]);

      expect(keyword.history7d).toEqual({});
   });

   it('reads legacy unpadded history keys as padded keys, preferring an existing padded entry', () => {
      const [parsed] = parseKeywords([buildKeyword({
         history: JSON.stringify({ '2026-1-5': 9, '2026-01-05': 2, '2026-2-3': 4 }),
         history7d: JSON.stringify({ '2026-1-5': 7 }),
      }) as any]);

      expect(parsed.history).toEqual({ '2026-01-05': 2, '2026-02-03': 4 });
      expect(parsed.history7d).toEqual({ '2026-01-05': 7 });
   });

   it('logs a warning when the stored history cannot be parsed', () => {
      const { logger } = require('../../utils/logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const [keyword] = parseKeywords([buildKeyword({ history: '{not json' }) as any]);

      expect(keyword.history).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('history'), expect.anything());
      warnSpy.mockRestore();
   });
});
