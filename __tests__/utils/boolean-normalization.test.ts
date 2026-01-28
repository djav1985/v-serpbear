import { normalizeBooleanFlag } from '../../utils/client/helpers';

// Import the normalizeBoolean function - it's not exported but we need to test it
// We'll import parseKeywords and test through that for now
import parseKeywords from '../../utils/parseKeywords';

describe('Boolean Normalization Functions', () => {
  describe('normalizeBooleanFlag', () => {
    // Test current expected behavior for true values
    it('returns true for recognized truthy strings', () => {
      expect(normalizeBooleanFlag('1')).toBe(true);
      expect(normalizeBooleanFlag('true')).toBe(true);
      expect(normalizeBooleanFlag('TRUE')).toBe(true);
      expect(normalizeBooleanFlag('yes')).toBe(true);
      expect(normalizeBooleanFlag('YES')).toBe(true);
      expect(normalizeBooleanFlag('on')).toBe(true);
      expect(normalizeBooleanFlag('ON')).toBe(true);
      expect(normalizeBooleanFlag('  TRUE  ')).toBe(true);
    });

    // Test current expected behavior for false values
    it('returns false for recognized falsy strings', () => {
      expect(normalizeBooleanFlag('')).toBe(false);
      expect(normalizeBooleanFlag('0')).toBe(false);
      expect(normalizeBooleanFlag('false')).toBe(false);
      expect(normalizeBooleanFlag('FALSE')).toBe(false);
      expect(normalizeBooleanFlag('no')).toBe(false);
      expect(normalizeBooleanFlag('NO')).toBe(false);
      expect(normalizeBooleanFlag('off')).toBe(false);
      expect(normalizeBooleanFlag('OFF')).toBe(false);
      expect(normalizeBooleanFlag('  FALSE  ')).toBe(false);
      expect(normalizeBooleanFlag('   ')).toBe(false);
    });

    // Test expected behavior - unrecognized strings should default to false
    it('returns false for unrecognized non-empty strings (safer behavior)', () => {
      // These are examples of API error messages that should not be treated as true
      expect(normalizeBooleanFlag('API Error: Invalid request')).toBe(false);
      expect(normalizeBooleanFlag('Server error occurred')).toBe(false);
      expect(normalizeBooleanFlag('timeout')).toBe(false);
      expect(normalizeBooleanFlag('undefined')).toBe(false);
      expect(normalizeBooleanFlag('null')).toBe(false);
      expect(normalizeBooleanFlag('some random text')).toBe(false);
      expect(normalizeBooleanFlag('maybe')).toBe(false);
      expect(normalizeBooleanFlag('enabled')).toBe(false);
      expect(normalizeBooleanFlag('active')).toBe(false);
    });

    // Test non-string values work as expected
    it('handles non-string values correctly', () => {
      expect(normalizeBooleanFlag(true)).toBe(true);
      expect(normalizeBooleanFlag(false)).toBe(false);
      expect(normalizeBooleanFlag(1)).toBe(true);
      expect(normalizeBooleanFlag(0)).toBe(false);
      expect(normalizeBooleanFlag(42)).toBe(true);
      expect(normalizeBooleanFlag(null)).toBe(false);
      expect(normalizeBooleanFlag(undefined)).toBe(false);
   });
  });

  describe('normalizeBoolean (via parseKeywords) - deprecated', () => {
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
