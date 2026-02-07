/// <reference path="../types.d.ts" />

import { performance } from 'perf_hooks';
import { setTimeout as sleep } from 'timers/promises';
import Cryptr from 'cryptr';
import { RefreshResult, removeFromRetryQueue, retryScrape, scrapeKeywordFromGoogle } from './scraper';
import parseKeywords from './parseKeywords';
import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { serializeError } from './errorSerialization';
import { updateDomainStats } from './updateDomainStats';
import { decryptDomainScraperSettings, parseDomainScraperSettings } from './domainScraperSettings';
import { logger } from './logger';
import { fromDbBool, toDbBool } from './dbBooleans';
import normalizeDomainBooleans from './normalizeDomain';
import { retryQueueManager } from './retryQueueManager';
import { DEVICE_MOBILE, DEVICE_DESKTOP } from './constants';

const describeScraperType = (scraperType?: SettingsType['scraper_type']): string => {
   if (!scraperType || scraperType.length === 0) {
      return 'none';
   }

   return scraperType;
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
   device === DEVICE_MOBILE ? DEVICE_MOBILE : DEVICE_DESKTOP;

/**
 * Generates a cache key for matching desktop and mobile keyword pairs.
 * The key is used to store and retrieve desktop mapPackTop3 values for mobile keywords.
 * @param {KeywordType} keyword - The keyword to generate a cache key for
 * @returns {string} A unique cache key combining keyword, domain, country, and location
 */
const generateKeywordCacheKey = (keyword: KeywordType): string =>
   `${keyword.keyword}|${keyword.domain}|${keyword.country}|${normalizeLocationForCache(keyword.location)}`;

const clearKeywordUpdatingFlags = async (
   keywords: Keyword[],
   logContext: string,
   meta?: Record<string, unknown>,
   onlyWhenUpdating = false,
): Promise<void> => {
   if (keywords.length === 0) {
      return;
   }
   try {
      const keywordsToUpdate = onlyWhenUpdating
         ? keywords.filter((keyword) => fromDbBool(keyword.updating))
         : keywords;

      if (keywordsToUpdate.length === 0) {
         return;
      }

      const results = await Promise.allSettled(
         keywordsToUpdate.map(async (keyword) => {
            await keyword.update({ updating: toDbBool(false), updatingStartedAt: null });
            keyword.updating = toDbBool(false);
            keyword.updatingStartedAt = null;
         }),
      );

      results.forEach((result, index) => {
         if (result.status === 'rejected') {
            logger.error(
               `[ERROR] Failed to clear updating flags ${logContext}`,
               result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
               { keywordId: keywordsToUpdate[index]?.ID, ...meta },
            );
         }
      });
   } catch (error: any) {
      logger.error(`[ERROR] Failed to clear updating flags ${logContext}`, error, meta);
   }
};

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

   // Precompute per-domain "effective settings" map once
   if (domainNames.length > 0) {
      const domains = await Domain.findAll({
         where: { domain: domainNames },
         attributes: ['domain', 'scrapeEnabled', 'scraper_settings', 'business_name'],
      });
      const secret = process.env.SECRET;
      const cryptr = secret ? new Cryptr(secret) : null;
      scrapePermissions = new Map(domains.map((domain) => {
         const domainPlain = domain.get({ plain: true }) as DomainType & { scraper_settings?: any };
         const normalizedDomain = normalizeDomainBooleans(domainPlain);
         const isEnabled = normalizedDomain.scrapeEnabled;

         if (cryptr) {
            const persistedOverride = parseDomainScraperSettings(domainPlain?.scraper_settings);
            const decryptedOverride = decryptDomainScraperSettings(persistedOverride, cryptr);
            const hasOverride = !!decryptedOverride?.scraper_type;
            const hasBusinessName = typeof normalizedDomain.business_name === 'string' && normalizedDomain.business_name;
            
            if (hasOverride || hasBusinessName) {
               // Only clone settings when we have overrides
               const effectiveSettings: SettingsType = hasOverride 
                  ? {
                     ...settings,
                     // Safe to use non-null assertion: hasOverride already validates scraper_type is truthy
                     scraper_type: decryptedOverride.scraper_type!,
                     ...(typeof decryptedOverride.scraping_api === 'string' && { scraping_api: decryptedOverride.scraping_api }),
                  }
                  : { ...settings };

               if (hasBusinessName) {
                  (effectiveSettings as ExtendedSettings).business_name = normalizedDomain.business_name;
               }

               domainSpecificSettings.set(normalizedDomain.domain, effectiveSettings);
               
               if (hasOverride) {
                  domainsWithScraperOverrides.add(normalizedDomain.domain);
               }
            }
            // If no overrides and no business_name, we use the global settings directly (no clone needed)
         }

         return [normalizedDomain.domain, isEnabled];
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
      await clearKeywordUpdatingFlags(skippedKeywords, 'for skipped keywords');

      // Use batched removal for better performance and concurrency safety
      const idsToRemove = new Set(skippedKeywords.map((keyword) => keyword.ID));
      if (idsToRemove.size > 0) {
         await retryQueueManager.removeBatch(idsToRemove).catch((error: any) => {
            logger.error('[ERROR] Failed to update retry queue:', error);
         });
      }
   }

   const eligibleKeywordIds = eligibleKeywordModels.map((keyword) => keyword.ID);
   if (eligibleKeywordIds.length === 0) { return []; }

   const keywords:KeywordType[] = eligibleKeywordModels.map((el) => el.get({ plain: true }));
   const start = performance.now();
   const updatedKeywords: KeywordType[] = [];

   // Determine if all keywords can be scraped in parallel by checking effective settings (precomputed)
   const parallelScrapers = ['scrapingant', 'serpapi', 'searchapi'];
   const canScrapeInParallel = keywords.every((keyword) => {
      const effectiveSettings = resolveEffectiveSettings(keyword.domain, settings, domainSpecificSettings);
      return parallelScrapers.includes(effectiveSettings.scraper_type);
   });

   try {
      if (canScrapeInParallel) {
         // Parallel scraping: each keyword is updated immediately upon receiving API response
         const parallelUpdatedKeywords = await refreshParallel(keywords, eligibleKeywordModels, settings, domainSpecificSettings);
         updatedKeywords.push(...parallelUpdatedKeywords);
      } else {
         // Sequential scraping: scrape desktop keywords first, then mobile
         // This allows mobile keywords to use desktop results as fallback if needed (e.g., for valueserp)
         const sortedKeywords = [...eligibleKeywordModels].sort((a, b) => {
            const aDevice = normalizeDevice(a.device);
            const bDevice = normalizeDevice(b.device);
            // Desktop comes before mobile
            if (aDevice === DEVICE_DESKTOP && bDevice === DEVICE_MOBILE) return -1;
            if (aDevice === DEVICE_MOBILE && bDevice === DEVICE_DESKTOP) return 1;
            return 0;
         });

         // Map to store desktop results for each keyword (by keyword+domain+country+location)
         // This cache allows scrapers like valueserp to use desktop mapPackTop3 for mobile when needed
         const desktopMapPackCache = new Map<string, number>();

         for (const keyword of sortedKeywords) {
            const keywordPlain = keyword.get({ plain: true });
            logger.info('Processing keyword refresh', { keywordId: keywordPlain.ID, keyword: keywordPlain.keyword });
            const normalizedDevice = normalizeDevice(keywordPlain.device);
            const keywordKey = generateKeywordCacheKey(keywordPlain);
            
            // If this is a mobile keyword, check if we have desktop mapPackTop3 cached
            const fallbackMapPackTop3 = (normalizedDevice === DEVICE_MOBILE) 
               ? desktopMapPackCache.get(keywordKey) 
               : undefined;

            const updatedkeyword = await refreshAndUpdateKeyword(keyword, settings, domainSpecificSettings, fallbackMapPackTop3);
            updatedKeywords.push(updatedkeyword);

            // If this was a desktop keyword, cache its mapPackTop3
            // Note: undefined/null device is treated as desktop for consistency
            if (normalizedDevice === DEVICE_DESKTOP && updatedkeyword.mapPackTop3 !== undefined) {
               desktopMapPackCache.set(keywordKey, toDbBool(updatedkeyword.mapPackTop3));
            }

            if (keywords.length > 0 && settings.scrape_delay && settings.scrape_delay !== '0') {
               const delay = parseInt(settings.scrape_delay, 10);
               if (!isNaN(delay) && delay > 0) {
                  await sleep(Math.min(delay, 30000)); // Cap delay at 30 seconds for safety
               }
            }
         }
      }
   } catch (error: any) {
      logger.error('[ERROR] Unexpected error during keyword refresh:', error);
      // Ensure all keywords that were marked for update have their flags cleared
      // This prevents UI spinner from getting stuck if an unexpected error occurs
      const keywordIdsToCleanup = eligibleKeywordIds;
      try {
         const keywordModelsToCleanup = eligibleKeywordModels.filter((keyword) => keywordIdsToCleanup.includes(keyword.ID));
         await clearKeywordUpdatingFlags(keywordModelsToCleanup, 'after refresh error');
      } catch (cleanupError: any) {
         logger.error('[ERROR] Failed to cleanup updating flags after error:', cleanupError);
      }
      throw error; // Re-throw the original error after cleanup
   }

   const end = performance.now();
   if (updatedKeywords.length > 0) {
      logger.info('Keyword refresh completed', { count: updatedKeywords.length, duration: `${(end - start).toFixed(2)}ms` });
   }

   // Update domain stats for all affected domains after keyword updates
   // Process all domains in parallel for better performance
   if (updatedKeywords.length > 0) {
      const affectedDomains = Array.from(new Set(updatedKeywords.map((k) => k.domain)));
      await Promise.all(
         affectedDomains.map(domainName => updateDomainStats(domainName))
      );
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
   fallbackMapPackTop3?: number,
): Promise<KeywordType> => {
   const currentkeyword = keyword.get({ plain: true });
   const baseEffectiveSettings = resolveEffectiveSettings(currentkeyword.domain, settings, domainSpecificSettings);

   // For valueserp mobile keywords, pass the fallback mapPackTop3 from desktop
   const effectiveSettings: SettingsType & { fallback_mapPackTop3?: number } =
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
      const updateData: any = { updating: toDbBool(false), updatingStartedAt: null };

      if (scraperError) {
         const theDate = new Date();
         updateData.lastUpdateError = JSON.stringify({
            date: theDate.toJSON(),
            error: scraperError,
            scraper: effectiveSettings.scraper_type,
         });
      }

      // Update database to clear flags and persist error details if available.
      await keyword.update(updateData);
      logger.info('Keyword updating flag cleared after scraper error', { keywordId: keyword.ID, error: scraperError });
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
   const updatedKeywordData = { ...currentkeyword, updating: toDbBool(false), updatingStartedAt: null };
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

      // Trim history to last 30 days to optimize storage and read performance
      // This prevents history object from growing indefinitely
      const historyEntries = Object.entries(history);
      if (historyEntries.length >= 31) {
         // Once we have 31 entries (30 + today's new entry), trim to 30 most recent
         const sortedEntries = historyEntries
            .map(([key, value]) => ({ key, date: new Date(key).getTime(), value }))
            .sort((a, b) => a.date - b.date)
            .slice(-30); // Keep last 30 entries
         
         const trimmedHistory: Record<string, number> = {};
         sortedEntries.forEach(({ key, value }) => {
            trimmedHistory[key] = value;
         });
         Object.keys(history).forEach(key => delete history[key]);
         Object.assign(history, trimmedHistory);
      }

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
            logger.debug('Failed to serialise keyword result', { error });
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
            logger.debug('Failed to serialise local results', { error });
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
         updating: toDbBool(false),
         url: urlValue,
         lastResult: normalizedResult,
         localResults: normalizedLocalResults,
         history: JSON.stringify(history),
         lastUpdated: lastUpdatedValue,
         lastUpdateError: lastUpdateErrorValue,
         mapPackTop3: toDbBool(updatedKeyword.mapPackTop3),
         updatingStartedAt: null,
      };

      // Update retry queue outside of try-catch to prevent aborting on retry queue errors
      try {
         if (updatedKeyword.error && settings?.scrape_retry) {
            await retryScrape(keyword.ID);
         } else {
            await removeFromRetryQueue(keyword.ID);
         }
      } catch (queueError) {
         logger.error('[ERROR] Failed to update retry queue (non-fatal):', queueError instanceof Error ? queueError : new Error(String(queueError)), { keywordId: keyword.ID });
      }

      try {
         // Update database first; Sequelize updates the in-memory instance.
         await keywordRaw.update(dbPayload);
         
         // Log when updating flag is cleared to help debug UI issues
         logger.info('Keyword updating flag cleared', {
            keywordId: keyword.ID,
            keyword: keyword.keyword,
            position: newPos,
            hasError: dbPayload.lastUpdateError !== 'false',
         });
         // Only log significant updates (errors or top 3 map pack)
         if (dbPayload.lastUpdateError !== 'false' || dbPayload.mapPackTop3) {
            logger.info('Keyword updated', {
               keywordId: keyword.ID,
               keyword: keyword.keyword,
               device: keyword.device || 'desktop',
               mapPackTop3: fromDbBool(dbPayload.mapPackTop3),
               hasError: dbPayload.lastUpdateError !== 'false',
            });
         }

         let parsedError: false | { date: string; error: string; scraper: string } = false;
         if (dbPayload.lastUpdateError !== 'false') {
            try {
               parsedError = JSON.parse(dbPayload.lastUpdateError ?? 'false');
            } catch (parseError) {
               logger.debug('Failed to parse lastUpdateError', { lastUpdateError: dbPayload.lastUpdateError, parseError });
               parsedError = false;
            }
         }

         const effectiveLastUpdated = dbPayload.lastUpdated
            ?? (typeof keyword.lastUpdated === 'string' ? keyword.lastUpdated : '');

         updated = {
            ...keyword,
            position: newPos,
            updating: false,
            updatingStartedAt: null,
            url: dbPayload.url ?? '',
            lastResult: parsedNormalizedResult,
            localResults: parsedLocalResults,
            history,
            lastUpdated: effectiveLastUpdated,
            lastUpdateError: parsedError,
            mapPackTop3: fromDbBool(dbPayload.mapPackTop3),
         };
      } catch (error: any) {
         logger.error('[ERROR] Updating SERP for Keyword', error, { keyword: keyword.keyword });
         
         // Attempt fallback DB update to clear flags and prevent stuck "updating" state
         try {
            await keywordRaw.update({
               updating: toDbBool(false),
               updatingStartedAt: null,
            });
            logger.info('Keyword updating flag cleared via fallback', {
               keywordId: keyword.ID,
               keyword: keyword.keyword,
            });
         } catch (fallbackError: any) {
            logger.error('[ERROR] Failed to clear updating flag via fallback', fallbackError, { 
               keyword: keyword.keyword,
               keywordId: keyword.ID,
            });
         }
         
         updated = {
            ...keyword,
            updating: false,
            updatingStartedAt: null,
         };
      }
   }

   return updated;
};

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
   mapPackTop3: keyword.mapPackTop3 ?? false,
   error: typeof error === 'string' ? error : serializeError(error),
});

/**
 * Scrape Google Keyword Search Result in Parallel.
 * Each keyword's database row is updated immediately upon receiving the API response.
 * @param {KeywordType[]} keywords - Keywords to scrape
 * @param {Keyword[]} keywordModels - Keyword model instances for database updates
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @param {Map<string, SettingsType>} domainSpecificSettings - Domain-specific settings
 * @returns {Promise<KeywordType[]>} Array of updated keywords
 */
const refreshParallel = async (
   keywords:KeywordType[],
   keywordModels: Keyword[],
   settings:SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
): Promise<KeywordType[]> => {
   const updatedKeywords: KeywordType[] = [];
   
   // Create map for quick model lookup by ID
   const modelMap = new Map(keywordModels.map(m => [m.ID, m]));
   
   // Start all scraping operations in parallel, but update database immediately upon each response
   const promises = keywords.map(async (keyword) => {
      const effectiveSettings = resolveEffectiveSettings(keyword.domain, settings, domainSpecificSettings);
      const keywordModel = modelMap.get(keyword.ID);
      
      if (!keywordModel) {
         logger.error('No keyword model found for ID', new Error(`Missing keyword model for keyword ID ${keyword.ID}`), { keywordId: keyword.ID });
         return keyword;
      }
      
      try {
         // Scrape the keyword
         const result = await scrapeKeywordFromGoogle(keyword, effectiveSettings);
         
         // Immediately update the database with the result
         if (result === false || !result) {
            const errorResult = buildErrorResult(keyword, result === false ? 'Scraper returned no data' : 'Unknown scraper response');
            const updatedKeyword = await updateKeywordPosition(keywordModel, errorResult, effectiveSettings);
            return updatedKeyword;
         }
         
         // Update database immediately upon receiving the API response
         const updatedKeyword = await updateKeywordPosition(keywordModel, result, effectiveSettings);
         return updatedKeyword;
         
      } catch (error: any) {
         logger.error('[ERROR] Parallel scrape failed for keyword:', error, { keyword: keyword.keyword });
         const errorResult = buildErrorResult(keyword, error);
         
         // Update database with error immediately
         const updatedKeyword = await updateKeywordPosition(keywordModel, errorResult, effectiveSettings);
         return updatedKeyword;
      }
   });

   // Wait for all updates to complete
   updatedKeywords.push(...await Promise.all(promises));
   
   logger.info('Parallel keyword refresh completed', { count: updatedKeywords.length });
   return updatedKeywords;
};

export default refreshAndUpdateKeywords;
