import { fromDbBool, toDbBool, normalizeToBoolean } from '../../utils/dbBooleans';
import parseKeywords from '../../utils/parseKeywords';

describe('db boolean helpers', () => {
  it('maps values to sqlite integer booleans', () => {
    expect(toDbBool(true)).toBe(1);
    expect(toDbBool(false)).toBe(0);
    expect(toDbBool(1)).toBe(1);
    expect(toDbBool(0)).toBe(0);
    expect(toDbBool(null)).toBe(0);
    expect(toDbBool(undefined)).toBe(0);
  });

  it('maps sqlite integers back to booleans', () => {
    expect(fromDbBool(1)).toBe(true);
    expect(fromDbBool(0)).toBe(false);
    expect(fromDbBool(null)).toBe(false);
    expect(fromDbBool(undefined)).toBe(false);
  });

  describe('normalizeToBoolean', () => {
    it('handles boolean values directly', () => {
      expect(normalizeToBoolean(true)).toBe(true);
      expect(normalizeToBoolean(false)).toBe(false);
    });

    it('handles numeric values (DB integers)', () => {
      expect(normalizeToBoolean(1)).toBe(true);
      expect(normalizeToBoolean(0)).toBe(false);
      expect(normalizeToBoolean(42)).toBe(true);
      expect(normalizeToBoolean(-1)).toBe(true);
    });

    it('handles string values (API responses)', () => {
      expect(normalizeToBoolean('true')).toBe(true);
      expect(normalizeToBoolean('True')).toBe(true);
      expect(normalizeToBoolean('TRUE')).toBe(true);
      expect(normalizeToBoolean('1')).toBe(true);
      
      expect(normalizeToBoolean('false')).toBe(false);
      expect(normalizeToBoolean('False')).toBe(false);
      expect(normalizeToBoolean('FALSE')).toBe(false);
      expect(normalizeToBoolean('0')).toBe(false);
      expect(normalizeToBoolean('')).toBe(false);
    });

    it('handles string values with whitespace', () => {
      expect(normalizeToBoolean('  true  ')).toBe(true);
      expect(normalizeToBoolean('  TRUE  ')).toBe(true);
      expect(normalizeToBoolean('  1  ')).toBe(true);
      expect(normalizeToBoolean('  false  ')).toBe(false);
      expect(normalizeToBoolean('  FALSE  ')).toBe(false);
      expect(normalizeToBoolean('  0  ')).toBe(false);
      expect(normalizeToBoolean('   ')).toBe(false);
    });

    it('handles null and undefined', () => {
      expect(normalizeToBoolean(null)).toBe(false);
      expect(normalizeToBoolean(undefined)).toBe(false);
    });

    it('uses conservative approach for unrecognized values (returns false)', () => {
      // Unrecognized strings should be treated as false for safety
      expect(normalizeToBoolean('no')).toBe(false);
      expect(normalizeToBoolean('NO')).toBe(false);
      expect(normalizeToBoolean('error')).toBe(false);
      expect(normalizeToBoolean('timeout')).toBe(false);
      expect(normalizeToBoolean('API Error')).toBe(false);
      expect(normalizeToBoolean('null')).toBe(false);
      expect(normalizeToBoolean('undefined')).toBe(false);
      expect(normalizeToBoolean('2')).toBe(false);
      // Objects and arrays should also be false
      expect(normalizeToBoolean([])).toBe(false);
      expect(normalizeToBoolean({})).toBe(false);
    });

    it('returns true for yes/on (recognized truthy synonyms)', () => {
      expect(normalizeToBoolean('yes')).toBe(true);
      expect(normalizeToBoolean('YES')).toBe(true);
      expect(normalizeToBoolean('on')).toBe(true);
      expect(normalizeToBoolean('ON')).toBe(true);
    });

    it('returns false for off/no (recognized falsy synonyms)', () => {
      expect(normalizeToBoolean('off')).toBe(false);
      expect(normalizeToBoolean('OFF')).toBe(false);
      expect(normalizeToBoolean('no')).toBe(false);
      expect(normalizeToBoolean('NO')).toBe(false);
    });
  });

  describe('normalizeToBoolean integration (parseKeywords DB coercion)', () => {
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

    it('returns true for integer 1 values', () => {
      const [k1] = parseKeywords([buildKeyword({ updating: 1 }) as any]);
      const [k2] = parseKeywords([buildKeyword({ sticky: 1 }) as any]);
      const [k3] = parseKeywords([buildKeyword({ mapPackTop3: 1 }) as any]);
      expect(k1.updating).toBe(true);
      expect(k2.sticky).toBe(true);
      expect(k3.mapPackTop3).toBe(true);
    });

    it('returns false for integer 0 values', () => {
      const [k1] = parseKeywords([buildKeyword({ updating: 0 }) as any]);
      const [k2] = parseKeywords([buildKeyword({ sticky: 0 }) as any]);
      const [k3] = parseKeywords([buildKeyword({ mapPackTop3: 0 }) as any]);
      expect(k1.updating).toBe(false);
      expect(k2.sticky).toBe(false);
      expect(k3.mapPackTop3).toBe(false);
    });

    it('coerces non-numeric values to false (default)', () => {
      const [k1] = parseKeywords([buildKeyword({ updating: 'API Error: Invalid request' }) as any]);
      const [k2] = parseKeywords([buildKeyword({ sticky: 'Server error occurred' }) as any]);
      const [k3] = parseKeywords([buildKeyword({ mapPackTop3: 'timeout' }) as any]);
      expect(k1.updating).toBe(false);
      expect(k2.sticky).toBe(false);
      expect(k3.mapPackTop3).toBe(false);
    });
  });
});
