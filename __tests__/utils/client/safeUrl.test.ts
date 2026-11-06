import { safeHttpUrl } from '../../../utils/client/safeUrl';

describe('safeHttpUrl', () => {
   it('keeps http and https URLs', () => {
      expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
      expect(safeHttpUrl(' http://example.com ')).toBe('http://example.com');
   });

   it('rejects other schemes, relative values and empty input', () => {
      expect(safeHttpUrl('javascript:alert(1)')).toBe('');
      expect(safeHttpUrl('data:text/html,hi')).toBe('');
      expect(safeHttpUrl('/relative/path')).toBe('');
      expect(safeHttpUrl('')).toBe('');
      expect(safeHttpUrl(undefined)).toBe('');
      expect(safeHttpUrl(null)).toBe('');
   });
});
