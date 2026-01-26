import { normalizeHostFromString } from '../../../utils/validators/hostname';

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
