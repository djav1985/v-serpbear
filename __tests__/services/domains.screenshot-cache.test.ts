export {};
type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

describe('fetchDomainScreenshot cache resilience', () => {
   const originalFetch = global.fetch;

   beforeEach(() => {
      jest.resetModules();
      localStorage.clear();
      if (!originalFetch) {
         (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
      }
   });

   afterEach(() => {
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

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('domainThumbs')).toBeNull();

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('clears cached thumbnails when values contain non-string data', async () => {
      // Cache with mixed data types (not valid DomainThumbEntry objects)
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': 'data:image/png;base64,validstring',
         'test.com': 123, // This is not a valid entry
         'another.com': 'valid-string'
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('domainThumbs')).toBeNull();

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('clears cached thumbnails when data is an array instead of object', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify([
         'data:image/png;base64,somedata',
         'data:image/png;base64,otherdata'
      ]));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('domainThumbs')).toBeNull();

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('returns cached data without fetching when entry is fresh', async () => {
      // Cache with valid { data, ts } entries where ts is within TTL
      const now = Date.now();
      const validCache = {
         'example.com': { data: 'data:image/png;base64,validdata', ts: now },
         'test.com': { data: 'data:image/png;base64,anothervalid', ts: now }
      };
      localStorage.setItem('domainThumbs', JSON.stringify(validCache));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject('Should not fetch'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe('data:image/png;base64,validdata');
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('refetches when entry is stale (older than TTL)', async () => {
      // 25-hour-old entry — past the 24h TTL
      const staleTs = Date.now() - 25 * 60 * 60 * 1000;
      const staleCache = {
         'example.com': { data: 'data:image/png;base64,staledata', ts: staleTs }
      };
      localStorage.setItem('domainThumbs', JSON.stringify(staleCache));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);

      await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      // Should have attempted a fresh fetch because entry was stale
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
   });

   it('forceFetch bypasses the TTL check and always refetches', async () => {
      // Fresh entry — would not be refetched normally
      const now = Date.now();
      const freshCache = {
         'example.com': { data: 'data:image/png;base64,freshdata', ts: now }
      };
      localStorage.setItem('domainThumbs', JSON.stringify(freshCache));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);

      await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com', true);

      // forceFetch=true should always hit the network even when cached value is fresh
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
   });

   it('clears cached thumbnails when values contain objects (not DomainThumbEntry)', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { url: 'data:image/png;base64,validdata' }, // missing ts field
         'test.com': 'valid-string'
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('domainThumbs')).toBeNull();

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('handles empty valid object cache correctly', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({}));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
         status: 500,
         blob: jest.fn(),
      } as unknown as Response);

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      // Empty cache should be preserved as it's valid
      expect(localStorage.getItem('domainThumbs')).toBe('{}');

      fetchSpy.mockRestore();
   });
});
