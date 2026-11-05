import { isGoogleRedirectUrl, resolveGoogleRedirect, resolveGoogleRedirects } from '../../utils/resolveGoogleLinks';

jest.mock('../../utils/logger', () => ({
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const redirectResponse = (location: string | null, status = 302) => ({
   status,
   headers: { get: (name: string) => (name.toLowerCase() === 'location' ? location : null) },
}) as unknown as Response;

describe('isGoogleRedirectUrl', () => {
   it('recognises Google goto and url redirect links', () => {
      expect(isGoogleRedirectUrl('https://www.google.com/goto?url=CAESmAEB')).toBe(true);
      expect(isGoogleRedirectUrl('https://www.google.co.uk/url?q=https://example.com/')).toBe(true);
   });

   it('ignores everything else', () => {
      expect(isGoogleRedirectUrl('https://example.com/goto?url=abc')).toBe(false);
      expect(isGoogleRedirectUrl('https://www.google.com/search?q=x')).toBe(false);
      expect(isGoogleRedirectUrl('https://notgoogle.com/goto?url=abc')).toBe(false);
      expect(isGoogleRedirectUrl('not a url')).toBe(false);
      expect(isGoogleRedirectUrl(undefined)).toBe(false);
   });
});

describe('resolveGoogleRedirect', () => {
   let fetchSpy: jest.SpyInstance;

   beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
   });

   afterEach(() => {
      fetchSpy.mockRestore();
   });

   it('returns non-redirect links unchanged without a request', async () => {
      await expect(resolveGoogleRedirect('https://example.com/page')).resolves.toBe('https://example.com/page');
      expect(fetchSpy).not.toHaveBeenCalled();
   });

   it('reads the address from /url?q= without a request', async () => {
      const resolved = await resolveGoogleRedirect('https://www.google.com/url?q=https://example.com/page&sa=U');
      expect(resolved).toBe('https://example.com/page');
      expect(fetchSpy).not.toHaveBeenCalled();
   });

   it('follows a goto link one hop to Google only and returns the Location without following it', async () => {
      fetchSpy.mockResolvedValue(redirectResponse('https://www.homespecfl.com/wind-mitigation/'));

      const resolved = await resolveGoogleRedirect('https://www.google.com/goto?url=CAESaaa');

      expect(resolved).toBe('https://www.homespecfl.com/wind-mitigation/');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://www.google.com/goto?url=CAESaaa');
      expect(fetchSpy.mock.calls[0][1].redirect).toBe('manual');
   });

   it('caches a resolved link', async () => {
      fetchSpy.mockResolvedValue(redirectResponse('https://cached.example/'));
      const link = 'https://www.google.com/goto?url=CAEScached';

      await resolveGoogleRedirect(link);
      await resolveGoogleRedirect(link);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
   });

   it('returns the original link when there is no usable Location, a non-redirect status, or the request fails', async () => {
      const link = 'https://www.google.com/goto?url=CAESfail';

      fetchSpy.mockResolvedValueOnce(redirectResponse(null));
      await expect(resolveGoogleRedirect(link)).resolves.toBe(link);

      fetchSpy.mockResolvedValueOnce(redirectResponse('https://x.example/', 200));
      await expect(resolveGoogleRedirect(link)).resolves.toBe(link);

      fetchSpy.mockResolvedValueOnce(redirectResponse('javascript:alert(1)'));
      await expect(resolveGoogleRedirect(link)).resolves.toBe(link);

      fetchSpy.mockRejectedValueOnce(new Error('timeout'));
      await expect(resolveGoogleRedirect(link)).resolves.toBe(link);
   });
});

describe('resolveGoogleRedirects', () => {
   afterEach(() => {
      jest.restoreAllMocks();
   });

   it('resolves only the redirect links, keeps order, and leaves unresolved ones as they were', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => (
         String(input).includes('CAESbad') ? redirectResponse(null) : redirectResponse('https://resolved.example/')
      ));
      const items = [
         { title: 'A', url: 'https://a.example/', position: 1 },
         { title: 'B', url: 'https://www.google.com/goto?url=CAESgood', position: 2 },
         { title: 'C', url: 'https://www.google.com/goto?url=CAESbad', position: 3 },
      ];

      const out = await resolveGoogleRedirects(items);

      expect(out.map((item) => item.url)).toEqual([
         'https://a.example/',
         'https://resolved.example/',
         'https://www.google.com/goto?url=CAESbad',
      ]);
      expect(out.map((item) => item.position)).toEqual([1, 2, 3]);
      expect(items[1].url).toBe('https://www.google.com/goto?url=CAESgood');
   });

   it('uses fallbackUrl for a link that cannot be resolved, and drops fallbackUrl from processed items', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(redirectResponse(null));
      const items = [
         { title: 'A', url: 'https://www.google.com/goto?url=CAESnofb', fallbackUrl: 'https://homespecfl.com/', position: 1 },
         { title: 'B', url: 'https://www.google.com/goto?url=CAESnofb2', position: 2 },
      ];

      const out = await resolveGoogleRedirects(items);

      expect(out[0]).toEqual({ title: 'A', url: 'https://homespecfl.com/', position: 1 });
      expect(out[1].url).toBe('https://www.google.com/goto?url=CAESnofb2');
   });

   it('returns the same list when nothing needs resolving', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const items = [{ title: 'A', url: 'https://a.example/' }];

      expect(await resolveGoogleRedirects(items)).toBe(items);
      expect(fetchSpy).not.toHaveBeenCalled();
   });
});
