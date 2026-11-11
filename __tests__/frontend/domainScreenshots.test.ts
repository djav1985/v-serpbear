describe('Domain screenshots', () => {
  type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

  describe('fetchDomainScreenshot cache resilience', () => {
     const originalFetch = global.fetch;
     const loadFetcher = (): FetchDomainScreenshot => {
        let fetcher!: FetchDomainScreenshot;
        jest.isolateModules(() => {
           fetcher = require('../../app/(dashboard)/domains/_components/screenshots').fetchDomainScreenshot;
        });
        return fetcher;
     };
     const mockFailedFetch = () => jest.spyOn(global, 'fetch').mockResolvedValue({
        status: 500,
        blob: jest.fn(),
     } as unknown as Response);

     beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        if (!originalFetch) {
           (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
        }
     });

     afterEach(() => {
        jest.restoreAllMocks();
        if (!originalFetch) {
           delete (global as unknown as { fetch?: jest.Mock }).fetch;
        }
     });

     it.each([
        ['invalid JSON string', 'not-json'],
        ['a JSON array', '[]'],
        ['a JSON primitive', 'true'],
        ['an object with non-entry values (number)', '{"domain":123}'],
        ['an object with plain string values (old cache format)', '{"domain.com":"data:image/png;base64,abc"}'],
     ])('clears invalid cached thumbnails (%s) before fetching', async (_name, invalidCache) => {
        localStorage.setItem('domainThumbs', invalidCache);

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = mockFailedFetch();
        const result = await fetchDomainScreenshot('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();
     });

     it('clears cached thumbnails when values contain non-string data', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify({
           'example.com': 'data:image/png;base64,validstring',
           'test.com': 123,
           'another.com': 'valid-string'
        }));

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = mockFailedFetch();
        const result = await fetchDomainScreenshot('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();
     });

     it('returns cached data without fetching when entry is fresh', async () => {
        const now = Date.now();
        const validCache = {
           'example.com': { data: 'data:image/png;base64,validdata', ts: now },
           'test.com': { data: 'data:image/png;base64,anothervalid', ts: now }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(validCache));

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject('Should not fetch'));
        const result = await fetchDomainScreenshot('example.com');

        expect(result).toBe('data:image/png;base64,validdata');
        expect(fetchSpy).not.toHaveBeenCalled();
     });

     it('refetches when entry is stale (older than TTL)', async () => {
        const staleTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
        const staleCache = {
           'example.com': { data: 'data:image/png;base64,staledata', ts: staleTs }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(staleCache));

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = mockFailedFetch();
        await fetchDomainScreenshot('example.com');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
     });

     it('forceFetch bypasses the TTL check and always refetches', async () => {
        const now = Date.now();
        const freshCache = {
           'example.com': { data: 'data:image/png;base64,freshdata', ts: now }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(freshCache));

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = mockFailedFetch();
        await fetchDomainScreenshot('example.com', true);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
     });

     it('handles empty valid object cache correctly', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify({}));

        const fetchDomainScreenshot = loadFetcher();
        const fetchSpy = mockFailedFetch();
        const result = await fetchDomainScreenshot('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBe('{}');
     });
  });
});
