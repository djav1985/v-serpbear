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
         delete (global as typeof globalThis & { fetch?: jest.Mock }).fetch;
      }
   });

   it.each([
      ['invalid JSON string', 'not-json'],
      ['a JSON array', '[]'],
      ['a JSON primitive', 'true'],
      ['an object with non-string values', '{"domain":123}'],
   ])('clears invalid cached thumbnails (%s) before fetching', async (_name, invalidCache) => {
      localStorage.setItem('domainThumbs', invalidCache);

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
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
      // Cache with mixed data types
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': 'data:image/png;base64,validstring',
         'test.com': 123, // This is not a string
         'another.com': 'valid-string'
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
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
      // Cache with array instead of object
      localStorage.setItem('domainThumbs', JSON.stringify([
         'data:image/png;base64,somedata',
         'data:image/png;base64,otherdata'
      ]));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
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

   it('preserves valid cached thumbnails with all string values', async () => {
      // Cache with valid data - all string values
      const validCache = {
         'example.com': 'data:image/png;base64,validdata',
         'test.com': 'data:image/png;base64,anothervalid'
      };
      localStorage.setItem('domainThumbs', JSON.stringify(validCache));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject('Should not fetch'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

      expect(result).toBe('data:image/png;base64,validdata');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('domainThumbs')).toBe(JSON.stringify(validCache));

      fetchSpy.mockRestore();
      warnSpy.mockRestore();
   });

   it('clears cached thumbnails when values contain objects', async () => {
      // Cache with object values instead of strings
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { url: 'data:image/png;base64,validdata' }, // Object instead of string
         'test.com': 'valid-string'
      }));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
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
      // Empty but valid object
      localStorage.setItem('domainThumbs', JSON.stringify({}));

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../app/services/domains');
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
