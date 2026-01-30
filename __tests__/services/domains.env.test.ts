type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

describe('domains service environment toggle', () => {
   const originalEnv = process.env;

   afterEach(() => {
      process.env = { ...originalEnv };
      jest.resetModules();
   });

   it('enables screenshots by default', () => {
      let screenshotsEnabled: boolean | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         screenshotsEnabled = mod.SCREENSHOTS_ENABLED;
      });
      expect(screenshotsEnabled).toBe(true);
   });

   it('enables adwords by default', () => {
      let adwordsEnabled: boolean | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         adwordsEnabled = mod.ADWORDS_ENABLED;
      });
      expect(adwordsEnabled).toBe(true);
   });

    it('disables screenshot fetching when NEXT_PUBLIC_SCREENSHOTS is false', async () => {
      process.env = { ...originalEnv, NEXT_PUBLIC_SCREENSHOTS: 'false' };
      jest.resetModules();

      let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
      jest.isolateModules(() => {
         const mod = require('../../services/domains');
         expect(mod.SCREENSHOTS_ENABLED).toBe(false);
         fetchDomainScreenshot = mod.fetchDomainScreenshot;
      });

      const originalFetch = global.fetch;
      if (!originalFetch) {
         (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
      }
      const fetchSpy = jest.spyOn(global, 'fetch');
      const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
      if (!originalFetch) {
         delete (global as typeof globalThis & { fetch?: jest.Mock }).fetch;
      }
    });

    it('disables adwords feature when NEXT_PUBLIC_ADWORDS is false', () => {
       process.env = { ...originalEnv, NEXT_PUBLIC_ADWORDS: 'false' };
       jest.resetModules();

       let adwordsEnabled: boolean | undefined;
       jest.isolateModules(() => {
          const mod = require('../../services/domains');
          adwordsEnabled = mod.ADWORDS_ENABLED;
       });

       expect(adwordsEnabled).toBe(false);
    });
});
