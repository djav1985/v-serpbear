/// <reference path="../types.d.ts" />

import { performance } from 'perf_hooks';
import { setTimeout as sleep } from 'timers/promises';
import { Op } from 'sequelize';
import { readFile, writeFile } from 'fs/promises';
import Cryptr from 'cryptr';
import { RefreshResult, removeFromRetryQueue, retryScrape, scrapeKeywordFromGoogle } from './scraper';
import parseKeywords from './parseKeywords';
import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { serializeError } from './errorSerialization';
import { updateDomainStats } from './updateDomainStats';
import { decryptDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';
import { logger } from './logger';

const describeScraperType = (scraperType?: SettingsType['scraper_type']): string => {
   if (!scraperType || scraperType.length === 0) {
      return 'none';
   }

   return scraperType;
};

const describeScrapingApiState = (settings: SettingsType): string => {
   if (!settings?.scraping_api) {
      return 'scraping API not configured';
   }

   return 'scraping API configured';
};

const logScraperSelectionSummary = (
   globalSettings: SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
   requestedDomains: string[],
   domainsWithScraperOverrides: Set<string>,
) => {
   // Only log when there are overrides or in debug mode
   if (domainsWithScraperOverrides.size > 0) {
      const overrides: string[] = [];
      for (const domain of domainsWithScraperOverrides) {
         const domainSettings = domainSpecificSettings.get(domain);
         if (domainSettings) {
            const overrideScraper = describeScraperType(domainSettings.scraper_type);
            overrides.push(`${domain}:${overrideScraper}`);
         }
      }
      logger.debug('Domain scraper overrides', { overrides });
   }
};

const resolveEffectiveSettings = (
   domain: string,
   globalSettings: SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
): SettingsType => domainSpecificSettings.get(domain) ?? globalSettings;

/**
 * Normalizes a location string for use in cache keys to ensure consistent
 * matching between desktop and mobile keyword pairs.
 *
 * - Treats undefined/null as an empty string.
 * - Trims leading/trailing whitespace.
 * - Collapses consecutive internal whitespace to a single space.
 * - Converts to lowercase for case-insensitive comparison.
 * - Attempts to decode URI-encoded strings (e.g., "New%20York") without
 *   throwing if the string is not valid URI-encoded text.
 */
const normalizeLocationForCache = (location?: string | null): string => {
   if (!location) {
      return '';
   }

   let normalized = location.trim();

   // Best-effort decode of URI-encoded locations; ignore failures.
   try {
      normalized = decodeURIComponent(normalized);
   } catch {
      // If decoding fails, fall back to the trimmed original.
   }

   // Collapse multiple whitespace characters into a single space and lowercase.
   normalized = normalized.replace(/\s+/g, ' ').toLowerCase();

   return normalized;
};

/**
 * Normalizes a device string to either 'desktop' or 'mobile'.
 * Treats undefined, null, or any non-'mobile' value as 'desktop'.
 * @param {string | undefined} device - The device type
 * @returns {'desktop' | 'mobile'} Normalized device type
 */
const normalizeDevice = (device?: string): 'desktop' | 'mobile' =>
   device === 'mobile' ? 'mobile' : 'desktop';

/**
 * Generates a cache key for matching desktop and mobile keyword pairs.
 * The key is used to store and retrieve desktop mapPackTop3 values for mobile keywords.
 * @param {KeywordType} keyword - The keyword to generate a cache key for
 * @returns {string} A unique cache key combining keyword, domain, country, and location
 */
const generateKeywordCacheKey = (keyword: KeywordType): string =>
   `${keyword.keyword}|${keyword.domain}|${keyword.country}|${normalizeLocationForCache(keyword.location)}`;

/**
 * Refreshes the Keywords position by Scraping Google Search Result by
 * Determining whether the keywords should be scraped in Parallel or not
 * @param {Keyword[]} rawkeyword - Keywords to scrape
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @returns {Promise}
 */
const refreshAndUpdateKeywords = async (rawkeyword:Keyword[], settings:SettingsType): Promise<KeywordType[]> => {
   if (!rawkeyword || rawkeyword.length === 0) { return []; }

   const domainNames = Array.from(new Set(rawkeyword.map((el) => el.domain).filter(Boolean)));
   let scrapePermissions = new Map<string, boolean>();
   const domainSpecificSettings = new Map<string, SettingsType>();
   const domainsWithScraperOverrides = new Set<string>();

   if (domainNames.length > 0) {
      const domains = await Domain.findAll({
         where: { domain: domainNames },
         attributes: ['domain', 'scrapeEnabled', 'scraper_settings', 'business_name'],
      });
      const secret = process.env.SECRET;
      const cryptr = secret ? new Cryptr(secret) : null;
      scrapePermissions = new Map(domains.map((domain) => {
         const domainPlain = domain.get({ plain: true }) as DomainType & { scraper_settings?: any };
         const isEnabled = domainPlain.scrapeEnabled !== false;

         if (cryptr) {
            const persistedOverride = parseDomainScraperSettings(domainPlain?.scraper_settings);
            const decryptedOverride = decryptDomainScraperSettings(persistedOverride, cryptr);
            if (decryptedOverride?.scraper_type) {
               const effectiveSettings: SettingsType = {
                  ...settings,
                  scraper_type: decryptedOverride.scraper_type,
               };

               if (typeof decryptedOverride.scraping_api === 'string') {
                  effectiveSettings.scraping_api = decryptedOverride.scraping_api;
               }

               if (typeof domainPlain.business_name === 'string') {
                  (effectiveSettings as any).business_name = domainPlain.business_name;
               }

               domainSpecificSettings.set(domainPlain.domain, effectiveSettings);
               domainsWithScraperOverrides.add(domainPlain.domain);
            } else if (typeof domainPlain.business_name === 'string' && domainPlain.business_name) {
               // No scraper override but has business_name - use global settings with business_name
               const effectiveSettings: SettingsType = {
                  ...settings,
               };
               (effectiveSettings as any).business_name = domainPlain.business_name;
               domainSpecificSettings.set(domainPlain.domain, effectiveSettings);
            }
         }

         return [domainPlain.domain, isEnabled];
      }));
   }

   logScraperSelectionSummary(settings, domainSpecificSettings, domainNames, domainsWithScraperOverrides);

   const skippedKeywords: Keyword[] = [];
   const eligibleKeywordModels = rawkeyword.filter((keyword) => {
      const isEnabled = scrapePermissions.get(keyword.domain);
      if (isEnabled === false) {
         skippedKeywords.push(keyword);
         return false;
      }
      return true;
   });

   if (skippedKeywords.length > 0) {
      const skippedIds = skippedKeywords.map((keyword) => keyword.ID);
      await Keyword.update(
         { updating: false },
         { where: { ID: { [Op.in]: skippedIds } } },
      );

      const idsToRemove = new Set(skippedIds);
      if (idsToRemove.size > 0) {
        const filePath = `${process.cwd()}/data/failed_queue.json`;
        try {
          const currentQueueRaw = await readFile(filePath, { encoding: 'utf-8' });
          let currentQueue: number[] = JSON.parse(currentQueueRaw);
          const initialLength = currentQueue.length;
          currentQueue = currentQueue.filter((item) => !idsToRemove.has(item));

          if (currentQueue.length < initialLength) {
            await writeFile(filePath, JSON.stringify(currentQueue), { encoding: 'utf-8' });
          }
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            logger.error('[ERROR] Failed to update retry queue:', error);
          }
        }
      }
   }

   if (eligibleKeywordModels.length === 0) { return []; }

   const keywords:KeywordType[] = eligibleKeywordModels.map((el) => el.get({ plain: true }));
   const start = performance.now();
   const updatedKeywords: KeywordType[] = [];

   // Determine if all keywords can be scraped in parallel by checking effective settings
   const parallelScrapers = ['scrapingant', 'serpapi', 'searchapi'];
   const canScrapeInParallel = keywords.every((keyword) => {
      const effectiveSettings = resolveEffectiveSettings(keyword.domain, settings, domainSpecificSettings);
      return parallelScrapers.includes(effectiveSettings.scraper_type);
   });

   if (canScrapeInParallel) {
      const refreshedResults = await refreshParallel(keywords, settings, domainSpecificSettings);
      if (refreshedResults.length > 0) {
         for (const keyword of rawkeyword) {
            const refreshedEntry = refreshedResults.find((entry) => entry && entry.keywordId === keyword.ID);
            if (refreshedEntry) {
               const updatedkeyword = await updateKeywordPosition(keyword, refreshedEntry.result, refreshedEntry.settings);
               updatedKeywords.push(updatedkeyword);
            } else {
               // If no refreshed entry found, ensure updating flag is cleared
               try {
                  await Keyword.update({ updating: false }, { where: { ID: keyword.ID } });
                  const currentKeyword = keyword.get({ plain: true });
                  const parsedKeyword = parseKeywords([currentKeyword])[0];
                  updatedKeywords.push({ ...parsedKeyword, updating: false });
               } catch (error: any) {
                  logger.error('[ERROR] Failed to clear updating flag for keyword:', error, { keywordId: keyword.ID });
               }
            }
         }
      }
   } else {
      // Sequential scraping: scrape desktop keywords first, then mobile
      // This allows mobile keywords to use desktop results as fallback if needed (e.g., for valueserp)
      const sortedKeywords = [...eligibleKeywordModels].sort((a, b) => {
         const aDevice = normalizeDevice(a.device);
         const bDevice = normalizeDevice(b.device);
         // Desktop comes before mobile
         if (aDevice === 'desktop' && bDevice === 'mobile') return -1;
         if (aDevice === 'mobile' && bDevice === 'desktop') return 1;
         return 0;
      });

      // Map to store desktop results for each keyword (by keyword+domain+country+location)
      // This cache allows scrapers like valueserp to use desktop mapPackTop3 for mobile when needed
      const desktopMapPackCache = new Map<string, boolean>();

      for (const keyword of sortedKeywords) {
         const keywordPlain = keyword.get({ plain: true });
         const normalizedDevice = normalizeDevice(keywordPlain.device);
         const keywordKey = generateKeywordCacheKey(keywordPlain);
         
         // If this is a mobile keyword, check if we have desktop mapPackTop3 cached
         const fallbackMapPackTop3 = (normalizedDevice === 'mobile') 
            ? desktopMapPackCache.get(keywordKey) 
            : undefined;

         const updatedkeyword = await refreshAndUpdateKeyword(keyword, settings, domainSpecificSettings, fallbackMapPackTop3);
         updatedKeywords.push(updatedkeyword);

         // If this was a desktop keyword, cache its mapPackTop3
         // Note: undefined/null device is treated as desktop for consistency
         if (normalizedDevice === 'desktop') {
            desktopMapPackCache.set(keywordKey, updatedkeyword.mapPackTop3 === true);
         }

         if (keywords.length > 0 && settings.scrape_delay && settings.scrape_delay !== '0') {
            const delay = parseInt(settings.scrape_delay, 10);
            if (!isNaN(delay) && delay > 0) {
               await sleep(Math.min(delay, 30000)); // Cap delay at 30 seconds for safety
            }
         }
      }
   }

   const end = performance.now();
   if (updatedKeywords.length > 0) {
      logger.info('Keyword refresh completed', { count: updatedKeywords.length, duration: `${(end - start).toFixed(2)}ms` });
   }
   
   // Update domain stats for all affected domains after keyword updates
   if (updatedKeywords.length > 0) {
      const affectedDomains = Array.from(new Set(updatedKeywords.map((k) => k.domain)));
      for (const domainName of affectedDomains) {
         await updateDomainStats(domainName);
      }
   }
   
   return updatedKeywords;
};

/**
 * Scrape Serp for given keyword and update the position in DB.
 * @param {Keyword} keyword - Keywords to scrape
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @param {Map<string, SettingsType>} domainSpecificSettings - Domain-specific settings
 * @param {boolean} fallbackMapPackTop3 - Optional fallback mapPackTop3 value from desktop keyword (for valueserp mobile)
 * @returns {Promise<KeywordType>}
 */
const refreshAndUpdateKeyword = async (
   keyword: Keyword,
   settings: SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
   fallbackMapPackTop3?: boolean,
): Promise<KeywordType> => {
   const currentkeyword = keyword.get({ plain: true });
   const baseEffectiveSettings = resolveEffectiveSettings(currentkeyword.domain, settings, domainSpecificSettings);

   // For valueserp mobile keywords, pass the fallback mapPackTop3 from desktop
   const effectiveSettings: SettingsType & { fallback_mapPackTop3?: boolean } =
      fallbackMapPackTop3 !== undefined && baseEffectiveSettings.scraper_type === 'valueserp'
         ? { ...baseEffectiveSettings, fallback_mapPackTop3: fallbackMapPackTop3 }
         : baseEffectiveSettings;
   let refreshedkeywordData: RefreshResult | false = false;
   let scraperError: string | false = false;

   try {
      refreshedkeywordData = await scrapeKeywordFromGoogle(currentkeyword, effectiveSettings);
      // If scraper returns false or has an error, capture the error
      if (!refreshedkeywordData) {
         scraperError = 'Scraper returned no data';
      } else if (refreshedkeywordData.error) {
         scraperError = typeof refreshedkeywordData.error === 'string'
            ? refreshedkeywordData.error
            : JSON.stringify(refreshedkeywordData.error);
      }
   } catch (error: any) {
      scraperError = serializeError(error);
      logger.error('[ERROR] Scraper failed for keyword:', error, { keyword: currentkeyword.keyword, scraperError });
   }

   // Update keyword position or handle error
   if (refreshedkeywordData) {
      const updatedkeyword = await updateKeywordPosition(keyword, refreshedkeywordData, effectiveSettings);
      return updatedkeyword;
   }

   // Handle error case: set updating to false and save error
   try {
      const updateData: any = { updating: false };

      if (scraperError) {
         const theDate = new Date();
         updateData.lastUpdateError = JSON.stringify({
            date: theDate.toJSON(),
            error: scraperError,
            scraper: effectiveSettings.scraper_type,
         });
      }

      await Keyword.update(updateData, { where: { ID: keyword.ID } });
      keyword.set(updateData);
   } catch (updateError: any) {
      logger.error('[ERROR] Failed to update keyword error status:', updateError);
   }

   try {
      if (effectiveSettings?.scrape_retry) {
         await retryScrape(keyword.ID);
      } else {
         await removeFromRetryQueue(keyword.ID);
      }
   } catch (queueError: any) {
      logger.error('[ERROR] Failed to update retry queue for keyword:', queueError, { keywordId: keyword.ID });
   }

   // Return the current keyword with updated state
   const updatedKeywordData = { ...currentkeyword, updating: false };
   return parseKeywords([updatedKeywordData])[0];
};

/**
 * Processes the scraped data for the given keyword and updates the keyword serp position in DB.
 * @param {Keyword} keywordRaw - Keywords to Update
 * @param {RefreshResult} updatedKeyword - scraped Data for that Keyword
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @returns {Promise<KeywordType>}
 */
export const updateKeywordPosition = async (keywordRaw:Keyword, updatedKeyword: RefreshResult, settings: SettingsType): Promise<KeywordType> => {
   const keywordParsed = parseKeywords([keywordRaw.get({ plain: true })]);
   const keyword = keywordParsed[0];
   let updated = keyword;

   if (updatedKeyword && keyword) {
      const theDate = new Date();
      const dateKey = `${theDate.getFullYear()}-${theDate.getMonth() + 1}-${theDate.getDate()}`;
      const newPos = Number(updatedKeyword.position ?? keyword.position ?? 0) || 0;

      const { history } = keyword;
      history[dateKey] = newPos;

      const normalizeResult = (result: any): string => {
         if (result === undefined || result === null) {
            return '[]';
         }

         if (typeof result === 'string') {
            return result;
         }

         try {
            return JSON.stringify(result);
         } catch (error: any) {
            logger.warn('[WARNING] Failed to serialise keyword result:', { error });
            return '[]';
         }
      };

      const normalizedResult = normalizeResult(updatedKeyword.result);
      let parsedNormalizedResult: KeywordLastResult[] = [];
      try {
         const maybeParsedResult = JSON.parse(normalizedResult);
         parsedNormalizedResult = Array.isArray(maybeParsedResult) ? maybeParsedResult : [];
      } catch {
         parsedNormalizedResult = [];
      }

      const normalizeLocalResults = (results: any): string => {
         if (results === undefined || results === null) {
            return JSON.stringify([]);
         }

         if (typeof results === 'string') {
            return results;
         }

         try {
            return JSON.stringify(results);
         } catch (error: any) {
            logger.warn('[WARNING] Failed to serialise local results:', { error });
            return JSON.stringify([]);
         }
      };

      const normalizedLocalResults = normalizeLocalResults(updatedKeyword.localResults);
      let parsedLocalResults: KeywordLocalResult[] = [];
      try {
         const maybeParsedLocalResults = JSON.parse(normalizedLocalResults);
         parsedLocalResults = Array.isArray(maybeParsedLocalResults) ? maybeParsedLocalResults : [];
      } catch {
         parsedLocalResults = [];
      }

      const hasError = Boolean(updatedKeyword.error);
      const lastUpdatedValue = hasError
         ? (typeof keyword.lastUpdated === 'string' ? keyword.lastUpdated : null)
         : theDate.toJSON();
      const lastUpdateErrorValue = hasError
         ? JSON.stringify({ date: theDate.toJSON(), error: serializeError(updatedKeyword.error), scraper: settings.scraper_type })
         : 'false';
      const urlValue = typeof updatedKeyword.url === 'string' ? updatedKeyword.url : null;

      const dbPayload = {
         position: newPos,
         updating: 0,
         url: urlValue,
         lastResult: normalizedResult,
         localResults: normalizedLocalResults,
         history: JSON.stringify(history),
         lastUpdated: lastUpdatedValue,
         lastUpdateError: lastUpdateErrorValue,
         mapPackTop3: updatedKeyword.mapPackTop3 === true,
      };

      if (updatedKeyword.error && settings?.scrape_retry) {
         await retryScrape(keyword.ID);
      } else {
         await removeFromRetryQueue(keyword.ID);
      }

      try {
         await keywordRaw.update(dbPayload);
         // Only log significant updates (errors or top 3 map pack)
         if (dbPayload.lastUpdateError !== 'false' || dbPayload.mapPackTop3) {
            logger.info('Keyword updated', { 
               keywordId: keyword.ID, 
               keyword: keyword.keyword,
               device: keyword.device || 'desktop',
               mapPackTop3: dbPayload.mapPackTop3,
               hasError: dbPayload.lastUpdateError !== 'false'
            });
         }

         let parsedError: false | { date: string; error: string; scraper: string } = false;
         if (dbPayload.lastUpdateError !== 'false') {
            try {
               parsedError = JSON.parse(dbPayload.lastUpdateError ?? 'false');
            } catch (parseError) {
               logger.warn('[WARNING] Failed to parse lastUpdateError:', { lastUpdateError: dbPayload.lastUpdateError, parseError });
               parsedError = false;
            }
         }

         const effectiveLastUpdated = dbPayload.lastUpdated
            ?? (typeof keyword.lastUpdated === 'string' ? keyword.lastUpdated : '');

         updated = {
            ...keyword,
            position: newPos,
            updating: false,
            url: dbPayload.url ?? '',
            lastResult: parsedNormalizedResult,
            localResults: parsedLocalResults,
            history,
            lastUpdated: effectiveLastUpdated,
            lastUpdateError: parsedError,
            mapPackTop3: dbPayload.mapPackTop3 === true,
         };
      } catch (error: any) {
         logger.error('[ERROR] Updating SERP for Keyword', error, { keyword: keyword.keyword });
      }
   }

   return updated;
};

/**
 * Scrape Google Keyword Search Result in Parallel.
 * @param {KeywordType[]} keywords - Keywords to scrape
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @returns {Promise}
 */
/**
 * Builds an error result object for a keyword that failed to scrape.
 * Preserves the keyword's existing state while capturing error details.
 * @param {KeywordType} keyword - The keyword that failed to scrape
 * @param {unknown} error - The error that occurred during scraping
 * @returns {RefreshResult} A refresh result object with error details
 */
const buildErrorResult = (keyword: KeywordType, error: unknown): RefreshResult => ({
   ID: keyword.ID,
   keyword: keyword.keyword,
   position: typeof keyword.position === 'number' ? keyword.position : 0,
   url: typeof keyword.url === 'string' ? keyword.url : '',
   result: [],
   localResults: Array.isArray(keyword.localResults) ? keyword.localResults : [],
   mapPackTop3: keyword.mapPackTop3 === true,
   error: typeof error === 'string' ? error : serializeError(error),
});

type ParallelKeywordRefresh = {
   keywordId: number;
   result: RefreshResult;
   settings: SettingsType;
};

const refreshParallel = async (
   keywords:KeywordType[],
   settings:SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
): Promise<ParallelKeywordRefresh[]> => {
   const promises = keywords.map(async (keyword) => {
      const effectiveSettings = resolveEffectiveSettings(keyword.domain, settings, domainSpecificSettings);
      try {
         const result = await scrapeKeywordFromGoogle(keyword, effectiveSettings);
         if (result === false) {
            return { keywordId: keyword.ID, result: buildErrorResult(keyword, 'Scraper returned no data'), settings: effectiveSettings };
         }

         if (result) {
            return { keywordId: keyword.ID, result, settings: effectiveSettings };
         }

         return { keywordId: keyword.ID, result: buildErrorResult(keyword, 'Unknown scraper response'), settings: effectiveSettings };
      } catch (error: any) {
         logger.error('[ERROR] Parallel scrape failed for keyword:', error, { keyword: keyword.keyword });
         return { keywordId: keyword.ID, result: buildErrorResult(keyword, error), settings: effectiveSettings };
      }
   });

   const resolvedResults = await Promise.all(promises);
   logger.info('Parallel keyword refresh completed', { count: resolvedResults.length });
   return resolvedResults;
};

export default refreshAndUpdateKeywords;
