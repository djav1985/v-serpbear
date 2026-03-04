import normalizeOrigin from '../../utils/normalizeOrigin';

describe('normalizeOrigin', () => {
   it('removes a single trailing slash', () => {
      expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
   });

   it('removes multiple trailing slashes', () => {
      expect(normalizeOrigin('https://example.com///')).toBe('https://example.com');
   });

   it('leaves a URL with no trailing slash unchanged', () => {
      expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
   });

   it('leaves an empty string unchanged', () => {
      expect(normalizeOrigin('')).toBe('');
   });

   it('handles URLs with paths and trailing slash', () => {
      expect(normalizeOrigin('https://example.com/path/')).toBe('https://example.com/path');
   });
});
