import { normalizeToBoolean } from '../../utils/dbBooleans';

// Import the normaliseBoolean function - it's not exported but we need to test it
// We'll import parseKeywords and test through that for now
import parseKeywords from '../../utils/parseKeywords';

describe('Boolean Normalization Functions', () => {
  describe('normalizeToBoolean', () => {
    // Test current expected behavior for true values
    it('returns true for recognized truthy strings', () => {
      expect(normalizeToBoolean('1')).toBe(true);
      expect(normalizeToBoolean('true')).toBe(true);
      expect(normalizeToBoolean('TRUE')).toBe(true);
      expect(normalizeToBoolean('yes')).toBe(true);
      expect(normalizeToBoolean('YES')).toBe(true);
      expect(normalizeToBoolean('on')).toBe(true);
      expect(normalizeToBoolean('ON')).toBe(true);
      expect(normalizeToBoolean('  TRUE  ')).toBe(true);
    });

    // Test current expected behavior for false values
    it('returns false for recognized falsy strings', () => {
      expect(normalizeToBoolean('')).toBe(false);
      expect(normalizeToBoolean('0')).toBe(false);
      expect(normalizeToBoolean('false')).toBe(false);
      expect(normalizeToBoolean('FALSE')).toBe(false);
      expect(normalizeToBoolean('no')).toBe(false);
      expect(normalizeToBoolean('NO')).toBe(false);
      expect(normalizeToBoolean('off')).toBe(false);
      expect(normalizeToBoolean('OFF')).toBe(false);
      expect(normalizeToBoolean('  FALSE  ')).toBe(false);
      expect(normalizeToBoolean('   ')).toBe(false);
    });

    // Test expected behavior - unrecognized strings should default to false
    it('returns false for unrecognized non-empty strings (safer behavior)', () => {
      // These are examples of API error messages that should not be treated as true
      expect(normalizeToBoolean('API Error: Invalid request')).toBe(false);
      expect(normalizeToBoolean('Server error occurred')).toBe(false);
      expect(normalizeToBoolean('timeout')).toBe(false);
      expect(normalizeToBoolean('undefined')).toBe(false);
      expect(normalizeToBoolean('null')).toBe(false);
      expect(normalizeToBoolean('some random text')).toBe(false);
      expect(normalizeToBoolean('maybe')).toBe(false);
      expect(normalizeToBoolean('enabled')).toBe(false);
      expect(normalizeToBoolean('active')).toBe(false);
    });

    // Test non-string values work as expected
    it('handles non-string values correctly', () => {
      expect(normalizeToBoolean(true)).toBe(true);
      expect(normalizeToBoolean(false)).toBe(false);
      expect(normalizeToBoolean(1)).toBe(true);
      expect(normalizeToBoolean(0)).toBe(false);
      expect(normalizeToBoolean(42)).toBe(true);
      expect(normalizeToBoolean(null)).toBe(false);
      expect(normalizeToBoolean(undefined)).toBe(false);
    });
  });

  describe('normaliseBoolean (via parseKeywords) - deprecated', () => {
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
      const [keyword1] = parseKeywords([buildKeyword({ updating: 1 }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 1 }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 1 }) as any]);

      expect(keyword1.updating).toBe(true);
      expect(keyword2.sticky).toBe(true);
      expect(keyword3.mapPackTop3).toBe(true);
    });

    // Test numeric 0 values are preserved
    it('returns false for integer 0 values', () => {
      const [keyword1] = parseKeywords([buildKeyword({ updating: 0 }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 0 }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 0 }) as any]);

      expect(keyword1.updating).toBe(false);
      expect(keyword2.sticky).toBe(false);
      expect(keyword3.mapPackTop3).toBe(false);
    });

    it('coerces non-numeric values to false (default)', () => {
      // API error messages or invalid data should be coerced to safe defaults
      const [keyword1] = parseKeywords([buildKeyword({ updating: 'API Error: Invalid request' }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 'Server error occurred' }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 'timeout' }) as any]);

      expect(keyword1.updating).toBe(false);
      expect(keyword2.sticky).toBe(false);
      expect(keyword3.mapPackTop3).toBe(false);
    });
  });
});
