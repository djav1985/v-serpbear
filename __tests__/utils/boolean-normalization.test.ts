import { normaliseBooleanFlag } from '../../app/utils/client/helpers';

// Import the normaliseBoolean function - it's not exported but we need to test it
// We'll import parseKeywords and test through that for now
import parseKeywords from '../../app/utils/parseKeywords';

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

  describe('normaliseBoolean (via parseKeywords)', () => {
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
      sticky: true,
      history: JSON.stringify({ '2025-01-01': 5 }),
      lastResult: JSON.stringify([]),
      url: 'https://example.com/page',
      tags: JSON.stringify(['tag']),
      updating: false,
      lastUpdateError: 'false',
      map_pack_top3: 0,
      ...overrides,
    });

    // Test current expected behavior for true values
    it('returns true for recognized truthy strings', () => {
      const [keyword1] = parseKeywords([buildKeyword({ updating: '1' }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 'true' }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ map_pack_top3: 'YES' }) as any]);
      const [keyword4] = parseKeywords([buildKeyword({ updating: 'on' }) as any]);

      expect(keyword1.updating).toBe(true);
      expect(keyword2.sticky).toBe(true);
      expect(keyword3.mapPackTop3).toBe(true);
      expect(keyword4.updating).toBe(true);
    });

    // Test current expected behavior for false values
    it('returns false for recognized falsy strings', () => {
      const [keyword1] = parseKeywords([buildKeyword({ updating: '0' }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 'false' }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ map_pack_top3: 'no' }) as any]);
      const [keyword4] = parseKeywords([buildKeyword({ updating: 'off' }) as any]);

      expect(keyword1.updating).toBe(false);
      expect(keyword2.sticky).toBe(false);
      expect(keyword3.mapPackTop3).toBe(false);
      expect(keyword4.updating).toBe(false);
    });

    // Test expected behavior - unrecognized strings should default to false
    it('returns false for unrecognized non-empty strings (safer behavior)', () => {
      // These are examples of API error messages that should not be treated as true
      const [keyword1] = parseKeywords([buildKeyword({ updating: 'API Error: Invalid request' }) as any]);
      const [keyword2] = parseKeywords([buildKeyword({ sticky: 'Server error occurred' }) as any]);
      const [keyword3] = parseKeywords([buildKeyword({ map_pack_top3: 'timeout' }) as any]);
      const [keyword4] = parseKeywords([buildKeyword({ updating: 'maybe' }) as any]);

      expect(keyword1.updating).toBe(false);
      expect(keyword2.sticky).toBe(false);
      expect(keyword3.mapPackTop3).toBe(false);
      expect(keyword4.updating).toBe(false);
    });
  });
});