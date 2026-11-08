import Cryptr from 'cryptr';

// A failed Google Ads volume lookup must come back as a failure. It used to come back as an empty success,
// and the Settings button reported "loaded successfully".

const SECRET = 'volume-test-secret';
const cryptr = new Cryptr(SECRET);
const storedSettings = {
   adwords_client_id: cryptr.encrypt('client-id'),
   adwords_client_secret: cryptr.encrypt('client-secret'),
   adwords_developer_token: cryptr.encrypt('developer-token'),
   adwords_account_id: cryptr.encrypt('123-456-7890'),
   adwords_refresh_token: cryptr.encrypt('refresh-token'),
};

const keyword = (ID: number, country: string) => ({ ID, keyword: `keyword ${ID}`, country }) as unknown as KeywordType;

type Reply = { status?: number; body?: unknown; contentType?: string } | Error;

/** Loads a fresh copy of the module (so the cached access token does not leak between tests) with the given replies. */
const load = (token: Reply, volume: Reply[]) => {
   const fetchMock = jest.fn(async (url: string) => {
      const reply = String(url).includes('oauth2') ? token : volume.shift();
      if (reply instanceof Error || reply === undefined) { throw reply ?? new Error('no reply queued'); }
      const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
      return {
         status: reply.status ?? 200,
         headers: { get: () => reply.contentType ?? 'application/json' },
         text: async () => text,
         json: async () => JSON.parse(text),
      };
   });
   global.fetch = fetchMock as unknown as typeof fetch;
   let adwords: typeof import('../../utils/adwords');
   jest.isolateModules(() => {
      jest.doMock('../../utils/settingsFile', () => ({ readSettingsFile: jest.fn(async () => storedSettings) }));
      // The pause between country requests is 7 seconds; skip it.
      jest.doMock('timers/promises', () => ({ setTimeout: () => Promise.resolve() }));
      jest.doMock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
      adwords = require('../../utils/adwords');
   });
   return { getKeywordsVolume: adwords!.getKeywordsVolume, fetchMock };
};

const goodToken: Reply = { body: { access_token: 'token' } };
const connectionRefused = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED 0.0.0.0:443'), { code: 'ECONNREFUSED' }) });
const volumeFor = (text: string, avgMonthlySearches: string): Reply => ({ body: { results: [{ text, keywordMetrics: { avgMonthlySearches } }] } });

describe('getKeywordsVolume failures', () => {
   const originalFetch = global.fetch;
   const originalSecret = process.env.SECRET;

   beforeEach(() => { process.env.SECRET = SECRET; });
   afterEach(() => {
      global.fetch = originalFetch;
      process.env.SECRET = originalSecret;
      jest.resetModules();
   });

   it('reports a network failure (blocked DNS, no connection) as an error, not an empty success', async () => {
      const { getKeywordsVolume } = load(goodToken, [connectionRefused]);

      const result = await getKeywordsVolume([keyword(1, 'US')]);

      expect(result.volumes).toBe(false);
      expect(result.error).toMatch(/Could not fetch keyword volume from Google Ads \(failed for US\)/);
      expect(result.failedCountries).toEqual(['US']);
   });

   it('reports a Google error response (for example an invalid developer token) as an error', async () => {
      const { getKeywordsVolume } = load(goodToken, [{ status: 401, body: { error: { details: [{ errors: [{ message: 'Developer token is not approved' }] }] } } }]);

      const result = await getKeywordsVolume([keyword(1, 'US')]);

      expect(result.volumes).toBe(false);
      expect(result.failedCountries).toEqual(['US']);
   });

   it('reports a non-JSON answer as an error', async () => {
      const { getKeywordsVolume } = load(goodToken, [{ status: 200, body: '<html>blocked</html>', contentType: 'text/html' }]);

      expect((await getKeywordsVolume([keyword(1, 'US')])).volumes).toBe(false);
   });

   it('reports a missing access token as an error, without calling the volume API', async () => {
      const { getKeywordsVolume, fetchMock } = load({ status: 400, body: { error: 'invalid_grant' } }, []);

      const result = await getKeywordsVolume([keyword(1, 'US')]);

      expect(result.volumes).toBe(false);
      expect(result.error).toMatch(/access token/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it('returns the volumes when the lookup works', async () => {
      const { getKeywordsVolume } = load(goodToken, [volumeFor('keyword 1', '320')]);

      expect(await getKeywordsVolume([keyword(1, 'US')])).toEqual({ volumes: { 1: 320 } });
   });

   it('treats a successful answer with no results as success, not failure', async () => {
      const { getKeywordsVolume } = load(goodToken, [{ body: {} }]);

      expect(await getKeywordsVolume([keyword(1, 'US')])).toEqual({ volumes: {} });
   });

   it('returns what loaded, and names the countries that failed, when only some countries fail', async () => {
      const { getKeywordsVolume } = load(goodToken, [volumeFor('keyword 1', '50'), connectionRefused]);

      const result = await getKeywordsVolume([keyword(1, 'US'), keyword(2, 'CA')]);

      expect(result.volumes).toEqual({ 1: 50 });
      expect(result.failedCountries).toEqual(['CA']);
      expect(result.error).toBeUndefined();
   });
});
