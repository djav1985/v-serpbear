/// <reference path="../types.d.ts" />
/* eslint-disable security/detect-non-literal-fs-filename -- the paths are a temp directory this test creates */

import os from 'os';
import path from 'path';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import allScrapers from '../scrapers/index';
import {
   collectInUseCreditKeys,
   creditKey,
   creditsUnitFor,
   flushScraperCredits,
   readScraperCredits,
   resolveCreditSource,
   supportsCredits,
   trackScrapeCredits,
} from '../utils/scraperCredits';
import { toDomainCardData } from '../app/(dashboard)/domains/_components/domain-card-data';

const scraper = (id: string): ScraperSettings => allScrapers.find((s: ScraperSettings) => s.id === id) as ScraperSettings;
const settingsFor = (scraping_api: string, scraper_type = 'serpapi') => ({ scraper_type, scraping_api } as SettingsType);

describe('provider credit lookups', () => {
   const originalFetch = global.fetch;
   afterEach(() => { global.fetch = originalFetch; });

   const mockAccount = (body: unknown, ok = true) => {
      const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => body });
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
   };

   it('SerpApi reads total_searches_left from account.json', async () => {
      const fetchMock = mockAccount({ plan_searches_left: 10, extra_credits: 5, total_searches_left: 15 });
      expect(await scraper('serpapi').fetchCredits?.(settingsFor('k e y'))).toBe(15);
      expect(fetchMock.mock.calls[0][0]).toBe('https://serpapi.com/account.json?api_key=k%20e%20y');
   });

   it('SearchApi reads account.remaining_credits with a Bearer key', async () => {
      const fetchMock = mockAccount({ account: { remaining_credits: 4200 } });
      expect(await scraper('searchapi').fetchCredits?.(settingsFor('abc'))).toBe(4200);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
   });

   it('ValueSERP adds monthly and top-up credits', async () => {
      mockAccount({ account_info: { monthly_credits_remaining: 900, topup_credits_remaining: 100 } });
      expect(await scraper('valueserp').fetchCredits?.(settingsFor('abc'))).toBe(1000);
   });

   it('ValueSERP counts a missing top-up as zero and rejects a missing monthly figure', async () => {
      mockAccount({ account_info: { monthly_credits_remaining: 900 } });
      expect(await scraper('valueserp').fetchCredits?.(settingsFor('abc'))).toBe(900);
      mockAccount({ account_info: {} });
      expect(await scraper('valueserp').fetchCredits?.(settingsFor('abc'))).toBeNull();
   });

   it('CrazySERP reads available_credits.total with a Bearer key', async () => {
      const fetchMock = mockAccount({ available_credits: { total: 77, free: 7 } });
      expect(await scraper('crazyserp').fetchCredits?.(settingsFor('abc'))).toBe(77);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
   });

   it('DataForSEO reads the dollar balance with Basic auth', async () => {
      const fetchMock = mockAccount({ tasks: [{ result: [{ money: { balance: 42.17 } }] }] });
      expect(await scraper('dataforseo').fetchCredits?.(settingsFor('login:pass'))).toBe(42.17);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${Buffer.from('login:pass').toString('base64')}`);
      expect(creditsUnitFor('dataforseo')).toBe('usd');
   });

   it('HasData reads data.availableCredits with an x-api-key header', async () => {
      const fetchMock = mockAccount({ status: 'ok', data: { totalCredits: 10000000, availableCredits: 5473702 } });
      expect(await scraper('hasdata').fetchCredits?.(settingsFor('abc'))).toBe(5473702);
      expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('abc');
   });

   it('returns null instead of throwing when the account call fails', async () => {
      mockAccount({}, false);
      expect(await scraper('serpapi').fetchCredits?.(settingsFor('abc'))).toBeNull();
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
      expect(await scraper('hasdata').fetchCredits?.(settingsFor('abc'))).toBeNull();
   });

   it('PrismCrawl reads the X-Credits-Remaining header', () => {
      const read = scraper('prismcrawl').readCredits as (body: any, headers: Headers) => number | null;
      expect(read({}, new Headers({ 'X-Credits-Remaining': '98' }))).toBe(98);
      expect(read({}, new Headers())).toBeNull();
      expect(read({}, new Headers({ 'X-Credits-Remaining': 'lots' }))).toBeNull();
   });

   it('Serper and Serply do not report credits', () => {
      expect(supportsCredits('serper')).toBe(false);
      expect(supportsCredits('serply')).toBe(false);
      expect(supportsCredits('valueserp')).toBe(true);
   });
});

describe('credit keys and sources', () => {
   it('hashes the key and never contains it', () => {
      const key = creditKey('serpapi', 'super-secret-key');
      expect(key.startsWith('serpapi:')).toBe(true);
      expect(key).not.toContain('super-secret-key');
      expect(creditKey('serpapi', 'super-secret-key')).toBe(key);
      expect(creditKey('serpapi', 'other-key')).not.toBe(key);
   });

   it('uses the global scraper unless the domain has its own', () => {
      const global = settingsFor('global-key', 'serpapi');
      expect(resolveCreditSource({}, global, null)).toEqual({ scraperId: 'serpapi', apiKey: 'global-key' });
   });

   it('collects the global key; a different provider override without a key is not counted', () => {
      const keys = collectInUseCreditKeys(settingsFor('global-key', 'serpapi'), [{}]);
      expect(Array.from(keys)).toEqual([creditKey('serpapi', 'global-key')]);
      expect(collectInUseCreditKeys(settingsFor('', 'none'), []).size).toBe(0);
   });
});

describe('tracking and saving balances', () => {
   let dir: string;
   let cwdSpy: jest.SpyInstance;
   const file = () => path.join(dir, 'data', 'scraper_credits.json');

   beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-credits-'));
      mkdirSync(path.join(dir, 'data'));
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
   });
   afterEach(async () => {
      await flushScraperCredits();
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
      jest.restoreAllMocks();
   });

   const prism = () => scraper('prismcrawl');
   const response = (credits: string) => ({ headers: new Headers({ 'x-credits-remaining': credits }) }) as unknown as Response;

   it('keeps the lowest balance seen during a run and saves it once', async () => {
      trackScrapeCredits(prism(), settingsFor('k1', 'prismcrawl'), response('95'), {});
      trackScrapeCredits(prism(), settingsFor('k1', 'prismcrawl'), response('93'), {});
      trackScrapeCredits(prism(), settingsFor('k1', 'prismcrawl'), response('94'), {});
      await flushScraperCredits();
      const saved = await readScraperCredits();
      const entry = saved[creditKey('prismcrawl', 'k1')];
      expect(entry.remaining).toBe(93);
      expect(entry.scraper).toBe('prismcrawl');
      expect(JSON.stringify(saved)).not.toContain('k1"');
   });

   it('looks up account-endpoint scrapers once per key, however many scrapes used it', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ total_searches_left: 250 }) });
      global.fetch = fetchMock as unknown as typeof fetch;
      const serpapi = scraper('serpapi');
      for (let i = 0; i < 5; i += 1) { trackScrapeCredits(serpapi, settingsFor('shared'), response('0'), {}); }
      await flushScraperCredits();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((await readScraperCredits())[creditKey('serpapi', 'shared')].remaining).toBe(250);
   });

   it('keeps the saved number when an account lookup fails', async () => {
      writeFileSync(file(), JSON.stringify({ [creditKey('serpapi', 'shared')]: { scraper: 'serpapi', remaining: 99, updatedAt: 'x' } }));
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
      trackScrapeCredits(scraper('serpapi'), settingsFor('shared'), response('0'), {});
      await flushScraperCredits();
      expect((await readScraperCredits())[creditKey('serpapi', 'shared')].remaining).toBe(99);
   });

   it('drops saved entries that nothing uses anymore', async () => {
      const stale = creditKey('prismcrawl', 'old-key');
      writeFileSync(file(), JSON.stringify({ [stale]: { scraper: 'prismcrawl', remaining: 5, updatedAt: 'x' } }));
      trackScrapeCredits(prism(), settingsFor('current', 'prismcrawl'), response('50'), {});
      await flushScraperCredits(async () => new Set([creditKey('prismcrawl', 'current')]));
      const saved = await readScraperCredits();
      expect(saved[stale]).toBeUndefined();
      expect(saved[creditKey('prismcrawl', 'current')].remaining).toBe(50);
   });

   it('does not prune when the in-use lookup fails', async () => {
      const other = creditKey('prismcrawl', 'other');
      writeFileSync(file(), JSON.stringify({ [other]: { scraper: 'prismcrawl', remaining: 5, updatedAt: 'x' } }));
      trackScrapeCredits(prism(), settingsFor('current', 'prismcrawl'), response('50'), {});
      await flushScraperCredits(async () => { throw new Error('db down'); });
      expect((await readScraperCredits())[other]).toBeDefined();
   });

   it('writes nothing when no scraper reported a balance', async () => {
      trackScrapeCredits(scraper('serper'), settingsFor('k', 'serper'), response('1'), {});
      trackScrapeCredits(prism(), settingsFor('', 'prismcrawl'), response('1'), {});
      await flushScraperCredits();
      expect(existsSync(file())).toBe(false);
   });
});

describe('domain card data', () => {
   const base = { ID: 1, domain: 'example.com', slug: 'example-com' } as DomainType;

   it('carries the balance and unit, and null when the scraper reports none', () => {
      expect(toDomainCardData({ ...base, creditsRemaining: 973581 }).creditsRemaining).toBe(973581);
      expect(toDomainCardData({ ...base, creditsRemaining: 42.17, creditsUnit: 'usd' }).creditsUnit).toBe('usd');
      const none = toDomainCardData(base);
      expect(none.creditsRemaining).toBeNull();
      expect(none.creditsUnit).toBe('credits');
   });
});
