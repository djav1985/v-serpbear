import {
   trimStringProperties,
   trimString,
   hasTrimmedLength
} from '../../utils/security';
import { sanitizeHostname } from '../../utils/validators/hostname';

describe('Security Utilities', () => {
   describe('trimStringProperties', () => {
      it('should trim all string properties in an object', () => {
         const input = {
            stringProp: '  trimmed  ',
            anotherString: '\twhitespace\n',
            numberProp: 123,
            booleanProp: true,
            nullProp: null,
            undefinedProp: undefined
         };

         const result = trimStringProperties(input);

         expect(result.stringProp).toBe('trimmed');
         expect(result.anotherString).toBe('whitespace');
         expect(result.numberProp).toBe(123);
         expect(result.booleanProp).toBe(true);
         expect(result.nullProp).toBe(null);
         expect(result.undefinedProp).toBe(undefined);
      });

      it('should not modify the original object', () => {
         const input = {
            stringProp: '  original  ',
            numberProp: 456
         };

         const result = trimStringProperties(input);

         expect(input.stringProp).toBe('  original  ');
         expect(result.stringProp).toBe('original');
         expect(input).not.toBe(result);
      });

      it('should handle empty objects', () => {
         const result = trimStringProperties({});
         expect(result).toEqual({});
      });

      it('should handle objects with only non-string properties', () => {
         const input = {
            numberProp: 123,
            booleanProp: false,
            arrayProp: [1, 2, 3]
         };

         const result = trimStringProperties(input);
         expect(result).toEqual(input);
         expect(result).not.toBe(input); // Should still be a copy
      });
   });

   describe('trimString', () => {
      it('trims whitespace from strings', () => {
         expect(trimString('  hello  ')).toBe('hello');
         expect(trimString('\t\nworld\r\n')).toBe('world');
      });

      it('returns empty string for null and undefined', () => {
         expect(trimString(null)).toBe('');
         expect(trimString(undefined)).toBe('');
      });

      it('returns empty string for an empty string', () => {
         expect(trimString('')).toBe('');
      });
   });

   describe('hasTrimmedLength', () => {
      it('should return true for non-empty trimmed strings', () => {
         expect(hasTrimmedLength('hello')).toBe(true);
         expect(hasTrimmedLength('  world  ')).toBe(true);
         expect(hasTrimmedLength('\ttest\n')).toBe(true);
      });

      it('should return false for empty or whitespace-only strings', () => {
         expect(hasTrimmedLength('')).toBe(false);
         expect(hasTrimmedLength('   ')).toBe(false);
         expect(hasTrimmedLength('\t\n\r ')).toBe(false);
      });

      it('should handle numeric values correctly', () => {
         expect(hasTrimmedLength(587)).toBe(true);
         expect(hasTrimmedLength(0)).toBe(true);
         expect(hasTrimmedLength(-1)).toBe(true);
      });

      it('should handle null and undefined values', () => {
         expect(hasTrimmedLength(null)).toBe(false);
         expect(hasTrimmedLength(undefined)).toBe(false);
      });

      it('should handle boolean values', () => {
         expect(hasTrimmedLength(true)).toBe(true);
         expect(hasTrimmedLength(false)).toBe(true);
      });
   });
});

describe('sanitizeHostname (canonical, from validators/hostname)', () => {
   it('returns a valid hostname as-is (normalized)', () => {
      expect(sanitizeHostname('smtp.example.com')).toBe('smtp.example.com');
      expect(sanitizeHostname('MAIL.EXAMPLE.COM')).toBe('mail.example.com');
   });

   it('strips a trailing dot from a valid hostname', () => {
      expect(sanitizeHostname('smtp.example.com.')).toBe('smtp.example.com');
   });

   it('returns empty string for invalid hostnames', () => {
      expect(sanitizeHostname('not-a-hostname')).toBe('');
      expect(sanitizeHostname('')).toBe('');
      expect(sanitizeHostname(null as any)).toBe('');
      expect(sanitizeHostname(undefined as any)).toBe('');
   });

   it('returns empty string for a hostname with invalid characters', () => {
      expect(sanitizeHostname('bad host.com')).toBe('');
   });
});
