import {
   sanitizeHtml,
   sanitizeEmail,
   sanitizeDomain,
   sanitizeText,
   sanitizeNumber,
   sanitizeSqlParam,
   sanitizeJsonInput,
   checkRateLimit,
   resetRateLimitStorage,
   trimStringProperties,
   safeTrim,
   hasTrimmedLength
} from '../../app/utils/security';

describe('Security Utilities', () => {
   describe('sanitizeHtml', () => {
      it('should remove HTML tags', () => {
         expect(sanitizeHtml('<script>alert("xss")</script>test')).toBe('alert("xss")test');
         expect(sanitizeHtml('test<img src=x onerror=alert(1)>')).toBe('test');
      });

      it('should remove javascript protocol', () => {
         expect(sanitizeHtml('javascript:alert("xss")')).toBe('alert("xss")');
      });

      it('should remove event handlers', () => {
         expect(sanitizeHtml('test onclick=alert(1)')).toBe('test');
      });

      it('should handle non-string input', () => {
         expect(sanitizeHtml(null as any)).toBe('');
         expect(sanitizeHtml(undefined as any)).toBe('');
         expect(sanitizeHtml(123 as any)).toBe('');
      });
   });

   describe('sanitizeEmail', () => {
      it('should validate correct email addresses', () => {
         const result = sanitizeEmail('test@example.com');
         expect(result.isValid).toBe(true);
         expect(result.sanitized).toBe('test@example.com');
      });

      it('should reject invalid email addresses', () => {
         expect(sanitizeEmail('invalid-email').isValid).toBe(false);
         expect(sanitizeEmail('test@').isValid).toBe(false);
         expect(sanitizeEmail('@example.com').isValid).toBe(false);
      });

      it('should normalize email case', () => {
         const result = sanitizeEmail('TEST@EXAMPLE.COM');
         expect(result.sanitized).toBe('test@example.com');
      });
   });

   describe('sanitizeDomain', () => {
      it('should validate correct domain names', () => {
         const result = sanitizeDomain('example.com');
         expect(result.isValid).toBe(true);
         expect(result.sanitized).toBe('example.com');
      });

      it('should reject invalid domain names', () => {
         expect(sanitizeDomain('invalid domain').isValid).toBe(false);
         expect(sanitizeDomain('').isValid).toBe(false);
         expect(sanitizeDomain('-invalid.com').isValid).toBe(false);
      });

      it('should normalize domain case', () => {
         const result = sanitizeDomain('EXAMPLE.COM');
         expect(result.sanitized).toBe('example.com');
      });
   });

   describe('sanitizeText', () => {
      it('should remove control characters', () => {
         const input = 'test\x00\x08\x0B\x0C\x0E\x1F\x7F';
         expect(sanitizeText(input)).toBe('test');
      });

      it('should limit length', () => {
         const longText = 'a'.repeat(1000);
         expect(sanitizeText(longText, 100)).toHaveLength(100);
      });

      it('should handle non-string input', () => {
         expect(sanitizeText(null)).toBe('');
         expect(sanitizeText(123)).toBe('');
      });
   });

   describe('sanitizeNumber', () => {
      it('should validate numbers within range', () => {
         const result = sanitizeNumber(50, 0, 100);
         expect(result.isValid).toBe(true);
         expect(result.value).toBe(50);
      });

      it('should clamp numbers outside range', () => {
         const result = sanitizeNumber(150, 0, 100);
         expect(result.isValid).toBe(false);
         expect(result.value).toBe(100);
      });

      it('should handle string numbers', () => {
         const result = sanitizeNumber('50', 0, 100);
         expect(result.isValid).toBe(true);
         expect(result.value).toBe(50);
      });

      it('should reject invalid numbers', () => {
         expect(sanitizeNumber('invalid').isValid).toBe(false);
         expect(sanitizeNumber(NaN).isValid).toBe(false);
         expect(sanitizeNumber(Infinity).isValid).toBe(false);
      });
   });

   describe('sanitizeSqlParam', () => {
      it('should remove SQL injection characters', () => {
         expect(sanitizeSqlParam("test'; DROP TABLE users; --")).toBe('test DROP TABLE users --');
      });

      it('should handle numbers', () => {
         expect(sanitizeSqlParam(123)).toBe(123);
      });
   });

   describe('sanitizeJsonInput', () => {
      it('should handle valid JSON strings', () => {
         const result = sanitizeJsonInput('{"key": "value"}');
         expect(result.isValid).toBe(true);
         expect(result.sanitized).toEqual({ key: 'value' });
      });

      it('should handle objects', () => {
         const obj = { key: 'value' };
         const result = sanitizeJsonInput(obj);
         expect(result.isValid).toBe(true);
         expect(result.sanitized).toEqual(obj);
      });

      it('should reject invalid JSON', () => {
         const result = sanitizeJsonInput('invalid json');
         expect(result.isValid).toBe(false);
         expect(result.sanitized).toBe(null);
      });
   });

   describe('checkRateLimit', () => {
      beforeEach(() => {
         // Reset rate limit storage before each test
         resetRateLimitStorage();
      });

      it('should allow requests within limit', () => {
         const result = checkRateLimit('test-user', 5, 60000);
         expect(result.allowed).toBe(true);
         expect(result.remaining).toBe(4);
      });

      it('should track multiple requests', () => {
         const result1 = checkRateLimit('test-user', 2, 60000);
         expect(result1.allowed).toBe(true);
         expect(result1.remaining).toBe(1);
         
         const result2 = checkRateLimit('test-user', 2, 60000);
         expect(result2.allowed).toBe(true);
         expect(result2.remaining).toBe(0);
      });

      it('should block requests exceeding limit', () => {
         checkRateLimit('test-user', 1, 60000);
         const result = checkRateLimit('test-user', 1, 60000);
         expect(result.allowed).toBe(false);
         expect(result.remaining).toBe(0);
      });
   });

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

   describe('safeTrim', () => {
      it('should trim string values', () => {
         expect(safeTrim('  hello  ')).toBe('hello');
         expect(safeTrim('\t\nworld\r\n')).toBe('world');
      });

      it('should handle numeric values by converting to string', () => {
         expect(safeTrim(587)).toBe('587');
         expect(safeTrim(0)).toBe('0');
         expect(safeTrim(-42)).toBe('-42');
      });

      it('should handle null and undefined values', () => {
         expect(safeTrim(null)).toBe('');
         expect(safeTrim(undefined)).toBe('');
      });

      it('should handle boolean values', () => {
         expect(safeTrim(true)).toBe('true');
         expect(safeTrim(false)).toBe('false');
      });

      it('should handle object values by converting to string', () => {
         expect(safeTrim({})).toBe('[object Object]');
         expect(safeTrim([])).toBe('');
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