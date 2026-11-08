/// <reference path="../types.d.ts" />

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'crypto';
import { readFile } from 'fs/promises';
import * as path from 'path';
import Cryptr from 'cryptr';
import allScrapers from '../scrapers/index';
import { atomicWriteFile } from './atomicWrite';
import { withFileLock } from './fileLock';
import { readSettingsFile } from './settingsFile';
import { logger } from './logger';
import { decryptDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';

// Credits left on each scraper account, kept in data/scraper_credits.json. An entry belongs to a scraper plus an API key
// (stored as a keyed hash, never the key), so every domain that uses the same key reads and updates the same entry.

// `observedAt` is when the number was read: when an account lookup started, or when a response carrying it arrived.
// Overlapping refreshes can finish in a different order than they started, so a save only replaces a number that
// was read earlier. Entries saved before this field existed fall back to `updatedAt`.
export type CreditEntry = { scraper: string, remaining: number, updatedAt: string, observedAt?: number };
type CreditFile = Record<string, CreditEntry>;

const creditsFilePath = (): string => path.join(process.cwd(), 'data', 'scraper_credits.json');

const findScraper = (scraperId?: string | null): ScraperSettings | undefined => (
   (allScrapers as ScraperSettings[]).find((scraper) => scraper.id === scraperId)
);

/** True when the scraper can report the credits it has left. */
export const supportsCredits = (scraperId?: string | null): boolean => {
   const scraper = findScraper(scraperId);
   return !!(scraper?.readCredits || scraper?.fetchCredits);
};

/** The unit of a scraper's balance: 'usd' for a money balance, otherwise 'credits'. */
export const creditsUnitFor = (scraperId?: string | null): 'credits' | 'usd' => (
   findScraper(scraperId)?.creditsUnit === 'usd' ? 'usd' : 'credits'
);

/** Identifies one scraper account. Hashed with SECRET, so the file reveals nothing about the key. */
export const creditKey = (scraperId: string, apiKey: string): string => {
   const hash = createHmac('sha256', process.env.SECRET || 'serpbear-credits').update(apiKey).digest('hex').slice(0, 24);
   return `${scraperId}:${hash}`;
};

/** Which scraper and API key a domain scrapes with: its own override, or the global setting. */
export const resolveCreditSource = (
   domainPlain: { scraper_settings?: unknown } | null | undefined,
   globalSettings: Pick<SettingsType, 'scraper_type' | 'scraping_api'>,
   cryptr: Cryptr | null,
   strict = false,
): { scraperId: string, apiKey: string } => {
   const raw = domainPlain?.scraper_settings;
   // A corrupt override is unknown configuration, so callers doing cleanup must keep existing balances.
   const persisted = parseDomainScraperSettings(strict && typeof raw === 'string' && raw ? JSON.parse(raw) : raw);
   const decrypted = cryptr ? decryptDomainScraperSettings(persisted, cryptr, strict) : null;
   const overrideType = decrypted?.scraper_type;
   if (!overrideType) {
      return { scraperId: globalSettings.scraper_type, apiKey: globalSettings.scraping_api ?? '' };
   }
   // Never count the global key against a different override provider
   const apiKey = decrypted?.scraping_api || (overrideType === globalSettings.scraper_type ? (globalSettings.scraping_api ?? '') : '');
   return { scraperId: overrideType, apiKey };
};

/** The credit keys currently in use: the global scraper and every domain's own scraper. */
export const collectInUseCreditKeys = (
   globalSettings: Pick<SettingsType, 'scraper_type' | 'scraping_api'>,
   domains: { scraper_settings?: unknown }[],
): Set<string> => {
   const secret = process.env.SECRET;
   const cryptr = secret ? new Cryptr(secret) : null;
   const keys = new Set<string>();
   const add = (source: { scraperId: string, apiKey: string }) => {
      if (source.apiKey && supportsCredits(source.scraperId)) {
         keys.add(creditKey(source.scraperId, source.apiKey));
      }
   };
   add({ scraperId: globalSettings.scraper_type, apiKey: globalSettings.scraping_api ?? '' });
   domains.forEach((domain) => add(resolveCreditSource(domain, globalSettings, cryptr, true)));
   return keys;
};

/** Reads the saved balances. A missing or unreadable file means none are known yet. */
export const readScraperCredits = async (): Promise<CreditFile> => {
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const parsed = JSON.parse(await readFile(creditsFilePath(), 'utf-8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as CreditFile : {};
   } catch {
      return {};
   }
};

let lastStamp = 0;
/** A millisecond timestamp that never repeats or goes backwards within this process, so two readings always order. */
const nextStamp = (): number => {
   lastStamp = Math.max(Date.now(), lastStamp + 1);
   return lastStamp;
};

const entryTime = (entry?: CreditEntry): number => (
   typeof entry?.observedAt === 'number' ? entry.observedAt : (Date.parse(entry?.updatedAt ?? '') || 0)
);

type CreditBatch = {
   observed: Map<string, { scraper: string, remaining: number, observedAt: number }>;
   lookups: Map<string, { scraper: ScraperSettings, settings: SettingsType }>;
};

const creditBatch = new AsyncLocalStorage<CreditBatch>();

export const withScraperCreditBatch = <T>(run: () => Promise<T>): Promise<T> =>
   creditBatch.run({ observed: new Map(), lookups: new Map() }, run);

export const readCurrentGlobalCreditSettings = async () => {
   const settings = await readSettingsFile();
   const secret = process.env.SECRET;
   if (!secret) { throw new Error('Cannot read scraper credit settings without SECRET'); }
   return {
      scraper_type: settings.scraper_type ?? 'none',
      scraping_api: settings.scraping_api ? new Cryptr(secret).decrypt(settings.scraping_api) : '',
   } satisfies Pick<SettingsType, 'scraper_type' | 'scraping_api'>;
};

/**
 * Called after every scrape response. Scrapers that send the balance with the response update the in-memory number;
 * scrapers with an account endpoint are queued for one lookup when the run ends. Never throws.
 */
export const trackScrapeCredits = (scraper: ScraperSettings, settings: SettingsType, response: Response, body: any): void => {
   try {
      const batch = creditBatch.getStore();
      if (!batch) { return; }
      const { observed, lookups } = batch;
      if (!settings?.scraping_api || (!scraper.readCredits && !scraper.fetchCredits)) { return; }
      const key = creditKey(scraper.id, settings.scraping_api);
      if (scraper.fetchCredits) {
         lookups.set(key, { scraper, settings });
         return;
      }
      const remaining = scraper.readCredits?.(body, response?.headers);
      if (typeof remaining === 'number' && Number.isFinite(remaining)) {
         // Responses of one run can arrive out of order, and credits only go down during a run, so the lowest wins.
         // Its time is when that reading arrived.
         const previous = observed.get(key);
         if (!previous || remaining <= previous.remaining) {
            observed.set(key, { scraper: scraper.id, remaining, observedAt: nextStamp() });
         }
      }
   } catch (error: any) {
      logger.debug('[CREDITS] Could not read credits from a response', { scraper: scraper?.id, error: error?.message });
   }
};

/**
 * Looks up the accounts queued during the run, then saves every balance in one write and drops entries that no
 * domain or the global setting uses anymore. `getInUseKeys` returns the keys still in use; if it fails or
 * returns null nothing is pruned. Never throws, so a credit problem cannot fail a refresh.
 */
export const flushScraperCredits = async (getInUseKeys?: () => Promise<Set<string> | null>): Promise<void> => {
   const batch = creditBatch.getStore();
   if (!batch || (batch.observed.size === 0 && batch.lookups.size === 0)) { return; }
   const { observed: seen, lookups: pending } = batch;
   batch.observed = new Map();
   batch.lookups = new Map();
   const flushStartedAt = nextStamp();

   try {
      const fresh = new Map(seen);
      await Promise.all(Array.from(pending.entries()).map(async ([key, { scraper, settings }]) => {
         try {
            // Stamped when the lookup starts, so a slow lookup that began earlier cannot overwrite a newer one
            const observedAt = nextStamp();
            const remaining = await scraper.fetchCredits?.(settings);
            if (typeof remaining === 'number' && Number.isFinite(remaining)) {
               fresh.set(key, { scraper: scraper.id, remaining, observedAt });
            }
         } catch (error: any) {
            logger.debug('[CREDITS] Account lookup failed', { scraper: scraper.id, error: error?.message });
         }
      }));

      const filePath = creditsFilePath();
      await withFileLock(filePath, async () => {
         const saved = await readScraperCredits();
         const next: CreditFile = { ...saved };
         const updatedAt = new Date().toJSON();
         // Compared here, under the lock, against what is saved now: another refresh may have saved a newer reading
         // while this one was looking up. A newer number replaces an older one in either direction (a top-up raises it).
         fresh.forEach((value, key) => {
            if (value.observedAt < entryTime(saved[key])) { return; }
            next[key] = { scraper: value.scraper, remaining: value.remaining, updatedAt, observedAt: value.observedAt };
         });
         if (getInUseKeys) {
            let inUse: Set<string> | null = null;
            try { inUse = await getInUseKeys(); } catch { /* Configuration is unreadable. Keep saved balances. */ }
            for (const key of Object.keys(next)) {
               if (inUse && !inUse.has(key) && entryTime(saved[key]) < flushStartedAt) { delete next[key]; }
            }
         }
         if (JSON.stringify(next) !== JSON.stringify(saved)) {
            await atomicWriteFile(filePath, JSON.stringify(next, null, 2));
         }
      });
   } catch (error: any) {
      logger.error('[CREDITS] Could not save scraper credits', error instanceof Error ? error : new Error(String(error)));
   }
};
