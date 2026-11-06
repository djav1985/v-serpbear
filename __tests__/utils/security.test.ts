import {
   trimStringProperties,
   trimString,
   hasTrimmedLength,
   sanitizeSmtpHost,
} from '../../utils/security';
import { normalizeHostFromString } from '../../utils/validators/hostname';

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

      it('should return a new copy without modifying the original, and equal copies for empty or non-string props', () => {
         const input = {
            stringProp: '  original  ',
            numberProp: 456
         };

         const result = trimStringProperties(input);

         expect(input.stringProp).toBe('  original  ');
         expect(result.stringProp).toBe('original');
         expect(input).not.toBe(result);

         expect(trimStringProperties({})).toEqual({});

         const nonString = {
            numberProp: 123,
            booleanProp: false,
            arrayProp: [1, 2, 3]
         };

         const copy = trimStringProperties(nonString);
         expect(copy).toEqual(nonString);
         expect(copy).not.toBe(nonString); // Should still be a copy
      });
   });

   describe('trimString', () => {
      it('trims whitespace from strings', () => {
         expect(trimString('  hello  ')).toBe('hello');
         expect(trimString('\t\nworld\r\n')).toBe('world');
      });

      it('returns empty string for null, undefined and empty input', () => {
         expect(trimString(null)).toBe('');
         expect(trimString(undefined)).toBe('');
         expect(trimString('')).toBe('');
      });
   });

   describe('hasTrimmedLength', () => {
      it('should return true for non-empty trimmed strings', () => {
         expect(hasTrimmedLength('hello')).toBe(true);
         expect(hasTrimmedLength('  world  ')).toBe(true);
         expect(hasTrimmedLength('\ttest\n')).toBe(true);
      });

      it('should return false for empty, whitespace-only, null or undefined values', () => {
         expect(hasTrimmedLength('')).toBe(false);
         expect(hasTrimmedLength('   ')).toBe(false);
         expect(hasTrimmedLength('\t\n\r ')).toBe(false);
         expect(hasTrimmedLength(null)).toBe(false);
         expect(hasTrimmedLength(undefined)).toBe(false);
      });

      it('should treat numbers and booleans as present values', () => {
         for (const value of [587, 0, -1, true, false]) {
            expect(hasTrimmedLength(value)).toBe(true);
         }
      });
   });
});

describe('sanitizeSmtpHost', () => {
   it('returns a domain hostname trimmed and lowercased', () => {
      expect(sanitizeSmtpHost('smtp.example.com')).toBe('smtp.example.com');
      expect(sanitizeSmtpHost('  MAIL.EXAMPLE.COM  ')).toBe('mail.example.com');
   });

   it('strips a trailing dot', () => {
      expect(sanitizeSmtpHost('smtp.example.com.')).toBe('smtp.example.com');
   });

   it('accepts localhost, single-label Docker service names and IP addresses', () => {
      expect(sanitizeSmtpHost('localhost')).toBe('localhost');
      expect(sanitizeSmtpHost('mail')).toBe('mail');
      expect(sanitizeSmtpHost('  mailserver  ')).toBe('mailserver');
      expect(sanitizeSmtpHost('192.168.1.1')).toBe('192.168.1.1');
      expect(sanitizeSmtpHost('10.0.0.1')).toBe('10.0.0.1');
   });

   it('returns empty string for null, undefined, or blank input', () => {
      expect(sanitizeSmtpHost(null)).toBe('');
      expect(sanitizeSmtpHost(undefined)).toBe('');
      expect(sanitizeSmtpHost('')).toBe('');
      expect(sanitizeSmtpHost('   ')).toBe('');
   });
});

describe('normalizeHostFromString', () => {
   it('normalizes URLs and hostnames to bare hosts', () => {
      expect(normalizeHostFromString(' https://WWW.Example.com/path ')).toBe('example.com');
      expect(normalizeHostFromString('example.com/path')).toBe('example.com');
      expect(normalizeHostFromString('sub.Example.com')).toBe('sub.example.com');
      expect(normalizeHostFromString('http://www.sub.example.com/')).toBe('sub.example.com');
   });

   it('returns null for invalid inputs', () => {
      expect(normalizeHostFromString('')).toBeNull();
      expect(normalizeHostFromString('not a url')).toBeNull();
   });
});
