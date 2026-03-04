import { calculateChartBounds } from '../../../utils/client/chartBounds';
import { isValidEmail } from '../../../utils/client/validators';
import { getSelectedUntrackedKeywords } from '../../../utils/client/helpers';

describe('calculateChartBounds', () => {
   it('returns default bounds when no valid points are provided', () => {
      expect(calculateChartBounds([0, 111, NaN])).toEqual({ min: 1, max: 100 });
   });

   it('applies padding around the min and max values for rank charts', () => {
      const bounds = calculateChartBounds([10, 20, 30]);
      expect(bounds).toEqual({ min: 8, max: 32 });
   });

   it('ensures min and max differ when all values are identical', () => {
      const bounds = calculateChartBounds([5, 5, 5]);
      expect(bounds.min).toBeLessThan(bounds.max as number);
      expect(bounds).toEqual({ min: 4, max: 6 });
   });

   it('supports forward charts without enforcing a 100 ceiling', () => {
      const bounds = calculateChartBounds([50, 75, 90], { reverse: false, noMaxLimit: true });
      expect(bounds).toEqual({ min: 46, max: 94 });
   });
});

describe('isValidEmail', () => {
   it('accepts valid email addresses', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.user@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.co.uk')).toBe(true);
      expect(isValidEmail('user_name@example.org')).toBe(true);
      expect(isValidEmail('user-name@sub.example.com')).toBe(true);
   });

   it('rejects invalid email addresses', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('   ')).toBe(false);
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('user@example')).toBe(false);
      expect(isValidEmail('user example@test.com')).toBe(false);
   });

   it('handles edge cases', () => {
      expect(isValidEmail('user@example.c')).toBe(false); // TLD too short
      expect(isValidEmail('user@example.co')).toBe(true); // TLD exactly 2 chars
      expect(isValidEmail('a@b.com')).toBe(true); // Short but valid
   });

   it('trims whitespace before validation', () => {
      expect(isValidEmail('  user@example.com  ')).toBe(true);
      expect(isValidEmail('\tuser@example.com\n')).toBe(true);
   });

   it('rejects non-string inputs', () => {
      expect(isValidEmail(null as unknown as string)).toBe(false);
      expect(isValidEmail(undefined as unknown as string)).toBe(false);
      expect(isValidEmail(123 as unknown as string)).toBe(false);
   });
});

describe('getSelectedUntrackedKeywords', () => {
   it('filters keywords to include only selected and untracked items', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: false },
         { uid: '2', keyword: 'keyword2', isTracked: true },
         { uid: '3', keyword: 'keyword3', isTracked: false },
         { uid: '4', keyword: 'keyword4', isTracked: true },
      ];

      const selectedIds = ['1', '2', '3'];

      const result = getSelectedUntrackedKeywords(keywords, selectedIds);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ uid: '1', isTracked: false });
      expect(result[1]).toMatchObject({ uid: '3', isTracked: false });
   });

   it('returns empty array when no keywords are selected', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: false },
         { uid: '2', keyword: 'keyword2', isTracked: true },
      ];

      const result = getSelectedUntrackedKeywords(keywords, []);

      expect(result).toHaveLength(0);
   });

   it('returns empty array when all selected keywords are tracked', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: true },
         { uid: '2', keyword: 'keyword2', isTracked: true },
      ];

      const selectedIds = ['1', '2'];

      const result = getSelectedUntrackedKeywords(keywords, selectedIds);

      expect(result).toHaveLength(0);
   });

   it('returns all selected keywords when none are tracked', () => {
      const keywords = [
         { uid: '1', keyword: 'keyword1', isTracked: false },
         { uid: '2', keyword: 'keyword2', isTracked: false },
         { uid: '3', keyword: 'keyword3', isTracked: false },
      ];

      const selectedIds = ['1', '3'];

      const result = getSelectedUntrackedKeywords(keywords, selectedIds);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ uid: '1', isTracked: false });
      expect(result[1]).toMatchObject({ uid: '3', isTracked: false });
   });

   it('handles keywords with additional properties', () => {
      interface ExtendedKeyword {
         uid: string;
         isTracked: boolean;
         keyword: string;
         country: string;
         competition: string;
      }

      const keywords: ExtendedKeyword[] = [
         { uid: '1', keyword: 'test1', isTracked: false, country: 'US', competition: 'HIGH' },
         { uid: '2', keyword: 'test2', isTracked: true, country: 'CA', competition: 'LOW' },
      ];

      const selectedIds = ['1', '2'];

      const result = getSelectedUntrackedKeywords(keywords, selectedIds);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
         uid: '1',
         isTracked: false,
         keyword: 'test1',
         country: 'US',
         competition: 'HIGH',
      });
   });
});
