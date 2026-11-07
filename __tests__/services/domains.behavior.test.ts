export {};
import type { NextRouter } from 'next/router';

const mockOrigin = 'http://localhost:3000';

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

import { fetchDomain } from '../../services/domains';

// ---------------------------------------------------------------------------
// domain screenshots
// ---------------------------------------------------------------------------

type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

describe('domain screenshots', () => {
   const originalEnv = process.env;

   afterEach(() => {
      process.env = { ...originalEnv };
      jest.resetModules();
   });

   it('keeps the favicon while thum.io is still generating the screenshot', async () => {
      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         fetchDomainScreenshot = require('../../services/domains').fetchDomainScreenshot;
      });

      const originalFetch = global.fetch;
      const blob = jest.fn();
      // thum.io answers 200 with a no-store placeholder image until the real screenshot is ready
      global.fetch = jest.fn().mockResolvedValue({
         status: 200,
         headers: { get: (name: string) => (name.toLowerCase() === 'cache-control' ? 'no-cache, no-store, must-revalidate' : null) },
         blob,
      }) as unknown as typeof fetch;
      window.localStorage.removeItem('domainThumbs');
      try {
         const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');
         expect(result).toBe(false);
         expect(blob).not.toHaveBeenCalled();
         expect(window.localStorage.getItem('domainThumbs')).toBeNull();
      } finally {
         global.fetch = originalFetch;
      }
   });

   it('returns false when the screenshot service does not answer with an image, so the favicon is shown', async () => {
      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         fetchDomainScreenshot = require('../../services/domains').fetchDomainScreenshot;
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ status: 404 }) as unknown as typeof fetch;
      window.localStorage.removeItem('domainThumbs');
      try {
         const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');
         expect(result).toBe(false);
         expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('image.thum.io'));
      } finally {
         global.fetch = originalFetch;
      }
   });
});

// ---------------------------------------------------------------------------
// fetchDomain
// ---------------------------------------------------------------------------

describe('fetchDomain', () => {
   const originalFetch = global.fetch;
   const pushMock = jest.fn();
   const router = { push: pushMock } as unknown as NextRouter;

   beforeEach(() => {
      pushMock.mockClear();
      global.fetch = jest.fn() as unknown as typeof fetch;
   });

   afterEach(() => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockReset();
   });

   afterAll(() => {
      global.fetch = originalFetch;
   });

   const mockSuccessfulFetch = (body: unknown) => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockResolvedValue({
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue(body),
      });
   };

   it('URL-encodes provided domain names before requesting the API', async () => {
      const payload = { domain: { ID: 42 } };
      mockSuccessfulFetch(payload);

      const domainWithPath = 'example.com/path? q';
      const response = await fetchDomain(router, domainWithPath);

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
         `${mockOrigin}/api/domain?domain=${encodeURIComponent(domainWithPath)}`,
         expect.objectContaining({ method: 'GET' }),
      );
      expect(response).toBe(payload);
   });

   it('defers empty domain validation to the API', async () => {
      const payload = { domain: null };
      mockSuccessfulFetch(payload);

      const response = await fetchDomain(router, '');

      const fetchMock = global.fetch as unknown as jest.Mock;
      expect(fetchMock).toHaveBeenCalledWith(
         `${mockOrigin}/api/domain?domain=`,
         expect.objectContaining({ method: 'GET' }),
      );
      expect(response).toBe(payload);
   });

   it('throws a descriptive error when the API returns 404', async () => {
      const fetchMock = global.fetch as unknown as jest.Mock;
      fetchMock.mockResolvedValueOnce({
         status: 404,
         headers: { get: jest.fn().mockReturnValue('application/json') },
         json: jest.fn().mockResolvedValue({ error: 'Domain not found' }),
      });

      await expect(fetchDomain(router, 'unknown.example.com')).rejects.toThrow('Domain not found');
      expect(pushMock).not.toHaveBeenCalled();
   });
});

// ---------------------------------------------------------------------------
// fetchDomainScreenshot cache resilience
// ---------------------------------------------------------------------------

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
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': 'data:image/png;base64,validstring',
         'test.com': 123,
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

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
   });

   it('forceFetch bypasses the TTL check and always refetches', async () => {
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

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
   });

   it('clears cached thumbnails when values contain objects (not DomainThumbEntry)', async () => {
      localStorage.setItem('domainThumbs', JSON.stringify({
         'example.com': { url: 'data:image/png;base64,validdata' },
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
      expect(localStorage.getItem('domainThumbs')).toBe('{}');

      fetchSpy.mockRestore();
   });
});
