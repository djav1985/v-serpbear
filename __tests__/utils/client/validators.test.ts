import { isValidDomain } from '../../../app/utils/client/validators';

describe('isValidDomain', () => {
   it('accepts common multi-label domains', () => {
      expect(isValidDomain('example.com')).toBe(true);
      expect(isValidDomain('foo.bar.co.uk')).toBe(true);
   });

   it('rejects known invalid inputs', () => {
      expect(isValidDomain('invalid_domain')).toBe(false);
      expect(isValidDomain('-leadingdash.com')).toBe(false);
      expect(isValidDomain('example..com')).toBe(false);
      expect(isValidDomain('')).toBe(false);
   });

   it('returns consistent results across repeated calls', () => {
      const value = 'repeat.example';
      expect(isValidDomain(value)).toBe(true);
      expect(isValidDomain(value)).toBe(true);
      expect(isValidDomain(value)).toBe(true);
   });
});
