/// <reference path="../types.d.ts" />

import { createHmac } from 'crypto';
import { readFile } from 'fs/promises';
import * as path from 'path';
import Cryptr from 'cryptr';
import allScrapers from '../scrapers/index';
import { atomicWriteFile } from './atomicWrite';
import { withFileLock } from './fileLock';
import { logger } from './logger';
import { decryptDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';

// Credits left on each scraper account, kept in data/scraper_credits.json. An entry belongs to a scraper plus an API key
// (stored as a keyed hash, never the key), so every domain that uses the same key reads and updates the same entry.

export type CreditEntry = { scraper: string, remaining: number, updatedAt: string };
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
): { scraperId: string, apiKey: string } => {
   const persisted = parseDomainScraperSettings(domainPlain?.scraper_settings);
   const decrypted = cryptr ? decryptDomainScraperSettings(persisted, cryptr) : null;
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
   globalSettings: SettingsType,
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
   domains.forEach((domain) => add(resolveCreditSource(domain, globalSettings, cryptr)));
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

// Balances seen since the last save. `observed` holds numbers read off scrape responses (the lowest wins, since
// credits only go down during a run); `lookups` holds accounts that need one account call at the end of the run.
let observed = new Map<string, { scraper: string, remaining: number }>();
let lookups = new Map<string, { scraper: ScraperSettings, settings: SettingsType }>();

/**
 * Called after every scrape response. Scrapers that send the balance with the response update the in-memory number;
 * scrapers with an account endpoint are queued for one lookup when the run ends. Never throws.
 */
export const trackScrapeCredits = (scraper: ScraperSettings, settings: SettingsType, response: Response, body: any): void => {
   try {
      if (!settings?.scraping_api || (!scraper.readCredits && !scraper.fetchCredits)) { return; }
      const key = creditKey(scraper.id, settings.scraping_api);
      if (scraper.fetchCredits) {
         lookups.set(key, { scraper, settings });
         return;
      }
      const remaining = scraper.readCredits?.(body, response?.headers);
      if (typeof remaining === 'number' && Number.isFinite(remaining)) {
         const previous = observed.get(key);
         observed.set(key, { scraper: scraper.id, remaining: previous ? Math.min(previous.remaining, remaining) : remaining });
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
   if (observed.size === 0 && lookups.size === 0) { return; }
   const seen = observed;
   const pending = lookups;
   observed = new Map();
   lookups = new Map();

   try {
      const fresh = new Map(seen);
      await Promise.all(Array.from(pending.entries()).map(async ([key, { scraper, settings }]) => {
         try {
            const remaining = await scraper.fetchCredits?.(settings);
            if (typeof remaining === 'number' && Number.isFinite(remaining)) {
               fresh.set(key, { scraper: scraper.id, remaining });
            }
         } catch (error: any) {
            logger.debug('[CREDITS] Account lookup failed', { scraper: scraper.id, error: error?.message });
         }
      }));

      let inUse: Set<string> | null = null;
      if (getInUseKeys) {
         try { inUse = await getInUseKeys(); } catch { inUse = null; }
      }

      const filePath = creditsFilePath();
      await withFileLock(filePath, async () => {
         const saved = await readScraperCredits();
         const next: CreditFile = { ...saved };
         const updatedAt = new Date().toJSON();
         fresh.forEach((value, key) => { next[key] = { scraper: value.scraper, remaining: value.remaining, updatedAt }; });
         if (inUse) {
            Object.keys(next).forEach((key) => { if (!inUse.has(key)) { delete next[key]; } });
         }
         if (JSON.stringify(next) !== JSON.stringify(saved)) {
            await atomicWriteFile(filePath, JSON.stringify(next, null, 2));
         }
      });
   } catch (error: any) {
      logger.error('[CREDITS] Could not save scraper credits', error instanceof Error ? error : new Error(String(error)));
   }
};
