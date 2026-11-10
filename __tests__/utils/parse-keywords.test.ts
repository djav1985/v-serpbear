import parseKeywords from '../../utils/parseKeywords';
import { buildKeywordRow } from '../__helpers__/keywordRow';

describe('parseKeywords', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseKeywords', () => {
     it('converts integer flags to booleans and defaults a missing mapPackTop3 to false', () => {
        const [falsy] = parseKeywords([
           buildKeywordRow({ updating: 0, sticky: 0, mapPackTop3: 0 }) as any,
        ]);
        expect(falsy.updating).toBe(false);
        expect(falsy.sticky).toBe(false);
        expect(falsy.mapPackTop3).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(falsy, 'mapPackTop3')).toBe(true);

        const [truthy] = parseKeywords([
           buildKeywordRow({ updating: 1, sticky: 1, mapPackTop3: 1 }) as any,
        ]);
        expect(truthy.updating).toBe(true);
        expect(truthy.sticky).toBe(true);
        expect(truthy.mapPackTop3).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(truthy, 'mapPackTop3')).toBe(true);

        const [missing] = parseKeywords([
           buildKeywordRow({ mapPackTop3: undefined }) as any,
        ]);
        expect(missing.mapPackTop3).toBe(false);
     });


     it('parses stored history and structured update errors from JSON', () => {
        const [keyword] = parseKeywords([
           buildKeywordRow({
             history7d: JSON.stringify({ '2025-01-01': 3, '2025-01-02': 4 }),
             lastUpdateError: JSON.stringify({ code: 'SCRAPE_FAILED', message: 'Provider unavailable' }),
           }) as any,
        ]);

        expect(keyword.history7d).toEqual({ '2025-01-01': 3, '2025-01-02': 4 });
        expect(keyword.lastUpdateError).toEqual({ code: 'SCRAPE_FAILED', message: 'Provider unavailable' });
     });

     it('leaves a null history7d as null (not backfilled) and omits history7d when the field is missing', () => {
        const [withNull] = parseKeywords([
           buildKeywordRow({ history7d: null }) as any,
        ]);
        expect(withNull.history7d).toBeNull();

        const base = buildKeywordRow() as any;
        delete base.history7d;
        const [withoutField] = parseKeywords([base]);
        expect(Object.prototype.hasOwnProperty.call(withoutField, 'history7d')).toBe(false);
     });

     it('falls back to an empty KeywordHistory when history7d contains invalid JSON', () => {
        const [keyword] = parseKeywords([
           buildKeywordRow({ history7d: 'not-valid-json' }) as any,
        ]);

        expect(keyword.history7d).toEqual({});
     });

     it('reads legacy unpadded history keys as padded keys, preferring an existing padded entry', () => {
        const [parsed] = parseKeywords([buildKeywordRow({
           history: JSON.stringify({ '2026-1-5': 9, '2026-01-05': 2, '2026-2-3': 4 }),
           history7d: JSON.stringify({ '2026-1-5': 7 }),
        }) as any]);

        expect(parsed.history).toEqual({ '2026-01-05': 2, '2026-02-03': 4 });
        expect(parsed.history7d).toEqual({ '2026-01-05': 7 });
     });

     it('logs when the stored history cannot be parsed', () => {
        const { logger } = require('../../utils/logger');
        // A history that cannot be read is logged at error level (see safeJsonParse).
        const logSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
        const [keyword] = parseKeywords([buildKeywordRow({ history: '{not json' }) as any]);

        expect(keyword.history).toEqual({});
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('history'), expect.any(Error));
        logSpy.mockRestore();
     });
  });
  it('coerces non-numeric values to false (default)', () => {
    const [k1] = parseKeywords([buildKeywordRow({ updating: 'API Error: Invalid request' }) as any]);
    const [k2] = parseKeywords([buildKeywordRow({ sticky: 'Server error occurred' }) as any]);
    const [k3] = parseKeywords([buildKeywordRow({ mapPackTop3: 'timeout' }) as any]);
    expect(k1.updating).toBe(false);
    expect(k2.sticky).toBe(false);
    expect(k3.mapPackTop3).toBe(false);
  });


});
