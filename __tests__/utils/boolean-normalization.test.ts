import { normaliseBooleanFlag } from '../../utils/client/helpers';

// Import the normaliseBoolean function - it's not exported but we need to test it
// We'll import parseKeywords and test through that for now
import parseKeywords from '../../utils/parseKeywords';

describe('Boolean Normalization Functions', () => {
  describe('normaliseBooleanFlag', () => {
    // Test current expected behavior for true values
    it('returns true for recognized truthy strings', () => {
      expect(normaliseBooleanFlag('1')).toBe(true);
      expect(normaliseBooleanFlag('true')).toBe(true);
      expect(normaliseBooleanFlag('TRUE')).toBe(true);
      expect(normaliseBooleanFlag('yes')).toBe(true);
      expect(normaliseBooleanFlag('YES')).toBe(true);
      expect(normaliseBooleanFlag('on')).toBe(true);
      expect(normaliseBooleanFlag('ON')).toBe(true);
      expect(normaliseBooleanFlag('  TRUE  ')).toBe(true);
    });

    // Test current expected behavior for false values
    it('returns false for recognized falsy strings', () => {
      expect(normaliseBooleanFlag('')).toBe(false);
      expect(normaliseBooleanFlag('0')).toBe(false);
      expect(normaliseBooleanFlag('false')).toBe(false);
      expect(normaliseBooleanFlag('FALSE')).toBe(false);
      expect(normaliseBooleanFlag('no')).toBe(false);
      expect(normaliseBooleanFlag('NO')).toBe(false);
      expect(normaliseBooleanFlag('off')).toBe(false);
      expect(normaliseBooleanFlag('OFF')).toBe(false);
      expect(normaliseBooleanFlag('  FALSE  ')).toBe(false);
      expect(normaliseBooleanFlag('   ')).toBe(false);
    });

    // Test expected behavior - unrecognized strings should default to false
    it('returns false for unrecognized non-empty strings (safer behavior)', () => {
      // These are examples of API error messages that should not be treated as true
      expect(normaliseBooleanFlag('API Error: Invalid request')).toBe(false);
      expect(normaliseBooleanFlag('Server error occurred')).toBe(false);
      expect(normaliseBooleanFlag('timeout')).toBe(false);
      expect(normaliseBooleanFlag('undefined')).toBe(false);
      expect(normaliseBooleanFlag('null')).toBe(false);
      expect(normaliseBooleanFlag('some random text')).toBe(false);
      expect(normaliseBooleanFlag('maybe')).toBe(false);
      expect(normaliseBooleanFlag('enabled')).toBe(false);
      expect(normaliseBooleanFlag('active')).toBe(false);
    });

    // Test non-string values work as expected
    it('handles non-string values correctly', () => {
      expect(normaliseBooleanFlag(true)).toBe(true);
      expect(normaliseBooleanFlag(false)).toBe(false);
      expect(normaliseBooleanFlag(1)).toBe(true);
      expect(normaliseBooleanFlag(0)).toBe(false);
      expect(normaliseBooleanFlag(42)).toBe(true);
      expect(normaliseBooleanFlag(null)).toBe(false);
      expect(normaliseBooleanFlag(undefined)).toBe(false);
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

    // parseKeywords no longer normalizes booleans - values are passed through as-is
    it('returns numeric 1 for integer 1 values', () => {
      const [keyword1] = parseKeywords([buildKeyword({ updating: 1 }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 1 }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 1 }) as any]);

      expect(keyword1.updating).toBe(1);
      expect(keyword2.sticky).toBe(1);
      expect(keyword3.mapPackTop3).toBe(1);
    });

    // Test numeric 0 values are preserved
    it('returns numeric 0 for integer 0 values', () => {
      const [keyword1] = parseKeywords([buildKeyword({ updating: 0 }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 0 }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 0 }) as any]);

      expect(keyword1.updating).toBe(0);
      expect(keyword2.sticky).toBe(0);
      expect(keyword3.mapPackTop3).toBe(0);
    });

    // Note: parseKeywords no longer normalizes unrecognized strings - they pass through as-is
    it('passes through non-standard values without normalization', () => {
      // These are examples of API error messages that should not be treated as true
      const [keyword1] = parseKeywords([buildKeyword({ updating: 'API Error: Invalid request' }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 'Server error occurred' }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ mapPackTop3: 'timeout' }) as any]);

      expect(keyword1.updating).toBe('API Error: Invalid request');
      expect(keyword2.sticky).toBe('Server error occurred');
      expect(keyword3.mapPackTop3).toBe('timeout');
    });
  });
});