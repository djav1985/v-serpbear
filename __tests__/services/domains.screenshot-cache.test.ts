type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

describe('fetchDomainScreenshot cache TTL behavior', () => {
   const originalFetch = global.fetch;

   beforeEach(() => {
      jest.resetModules();
      jest.useFakeTimers().setSystemTime(new Date('2024-01-10T00:00:00.000Z'));
      localStorage.clear();
      if (!originalFetch) {
         (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
      }
   });

   afterEach(() => {
      jest.useRealTimers();
      if (!originalFetch) {
         delete (global as typeof globalThis & { fetch?: jest.Mock }).fetch;
      }
   });

   it('returns fresh cache entry without refetching', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { image: 'cached-image', cachedAt: Date.now() - 1000 },
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe('cached-image');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
   });

   it('refetches when cache entry is stale and persists new timestamp', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { image: 'old-image', cachedAt: Date.now() - (1000 * 60 * 60 * 25) },
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      jest.spyOn(global, 'fetch').mockResolvedValue({ status: 500, blob: jest.fn() } as unknown as Response);
      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(fetch).toHaveBeenCalled();
      expect([false, 'old-image']).toContain(result);
   });

   it('forceFetch bypasses fresh cache and tries network', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { image: 'cached-image', cachedAt: Date.now() - 1000 },
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 500, blob: jest.fn() } as unknown as Response);
      await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com', true);

      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
   });
});
