import { isGoogleRedirectUrl, resolveGoogleRedirects } from '../../utils/resolveGoogleLinks';
import { logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
   logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const GOTO_A = 'https://www.google.com/goto?url=CAESaaa';
const GOTO_B = 'https://www.google.com/goto?url=CAESbbb';

const jsonResponse = (body: unknown, status = 200) => ({
   ok: status >= 200 && status < 300,
   status,
   json: async () => body,
}) as unknown as Response;

describe('isGoogleRedirectUrl', () => {
   it('recognises Google goto and url redirect links', () => {
      expect(isGoogleRedirectUrl(GOTO_A)).toBe(true);
      expect(isGoogleRedirectUrl('https://www.google.co.uk/url?q=https://example.com/')).toBe(true);
   });

   it('ignores everything else', () => {
      expect(isGoogleRedirectUrl('https://example.com/goto?url=abc')).toBe(false);
      expect(isGoogleRedirectUrl('https://www.google.com/search?q=x')).toBe(false);
      expect(isGoogleRedirectUrl('not a url')).toBe(false);
      expect(isGoogleRedirectUrl(undefined)).toBe(false);
   });
});

describe('resolveGoogleRedirects', () => {
   let fetchSpy: jest.SpyInstance;

   beforeEach(() => {
      jest.clearAllMocks();
      fetchSpy = jest.spyOn(global, 'fetch');
   });

   afterEach(() => {
      fetchSpy.mockRestore();
      jest.useRealTimers();
   });

   it('sends only the Google redirect links to Serper with the key, and swaps in the real addresses in order', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ title: 'B', link: 'https://b.example/page' }, { title: 'C', link: 'https://c.example/' }] }));
      const items = [
         { title: 'A', url: 'https://a.example/', position: 1 },
         { title: 'B', url: GOTO_A, position: 2 },
         { title: 'C', url: GOTO_B, position: 3 },
      ];

      const out = await resolveGoogleRedirects(items, 'secret-key');

      expect(out.map((item) => item.url)).toEqual(['https://a.example/', 'https://b.example/page', 'https://c.example/']);
      expect(out.map((item) => item.position)).toEqual([1, 2, 3]);
      expect(items[1].url).toBe(GOTO_A);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://google.serper.dev/resolve');
      expect(init.method).toBe('POST');
      expect(init.headers['X-API-KEY']).toBe('secret-key');
      expect(JSON.parse(init.body)).toEqual({ organic: [{ title: 'B', link: GOTO_A }, { title: 'C', link: GOTO_B }] });
   });

   it('does nothing without a key or without Google links', async () => {
      const items = [{ title: 'A', url: GOTO_A }];
      expect(await resolveGoogleRedirects(items, '')).toBe(items);
      expect(await resolveGoogleRedirects([{ title: 'A', url: 'https://a.example/' }], 'key')).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
   });

   it('sends unresolved links once more after waiting retryAfter seconds, and keeps the Google link if still unresolved', async () => {
      jest.useFakeTimers();
      fetchSpy
         .mockResolvedValueOnce(jsonResponse({ organic: [{ link: 'https://a.example/' }, { link: GOTO_B }], retryAfter: 20 }))
         .mockResolvedValueOnce(jsonResponse({ organic: [{ link: GOTO_B }] }));

      const promise = resolveGoogleRedirects([{ title: 'A', url: GOTO_A }, { title: 'B', url: GOTO_B }], 'key');
      await jest.advanceTimersByTimeAsync(19000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1000);
      const out = await promise;

      expect(out.map((item) => item.url)).toEqual(['https://a.example/', GOTO_B]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toEqual({ organic: [{ title: 'B', link: GOTO_B }] });
      expect(logger.warn).toHaveBeenCalledWith('[SCRAPE] Google links left unresolved', { unresolved: 1, total: 2 });
   });

   it('uses a 30 second timeout per call', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ link: 'https://a.example/' }] }));
      await resolveGoogleRedirects([{ title: 'A', url: GOTO_A }], 'key');
      expect(timeoutSpy).toHaveBeenCalledWith(30000);
      timeoutSpy.mockRestore();
   });

   it('tries a timed out call once more, then gives up without throwing', async () => {
      const items = [{ title: 'A', url: GOTO_A }];
      fetchSpy.mockRejectedValue(new Error('timeout'));
      await expect(resolveGoogleRedirects(items, 'key')).resolves.toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockReset();
      fetchSpy.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(jsonResponse({ organic: [{ link: 'https://a.example/' }] }));
      expect((await resolveGoogleRedirects(items, 'key'))[0].url).toBe('https://a.example/');
   });

   it.each([
      ['an HTTP error', () => fetchSpy.mockResolvedValue(jsonResponse({}, 401))],
      ['a response with the wrong shape', () => fetchSpy.mockResolvedValue(jsonResponse({ organic: [] }))],
      ['an unreadable response', () => fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } } as unknown as Response)],
   ])('leaves the links unchanged on %s, tries once more, and never throws', async (_name, arrange) => {
      arrange();
      const items = [{ title: 'A', url: GOTO_A }];

      await expect(resolveGoogleRedirects(items, 'key')).resolves.toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
   });

   it('does not accept a Google link as the answer, and tries once more', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ organic: [{ link: 'https://www.google.com/goto?url=CAESstill' }] }));
      const items = [{ title: 'A', url: GOTO_A }];

      expect(await resolveGoogleRedirects(items, 'key')).toEqual(items);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
   });
});
