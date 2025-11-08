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
) => {
   const fallbackScraper = describeScraperType(globalSettings?.scraper_type);
   console.log(`[REFRESH] Global scraper fallback: ${fallbackScraper}`);

   if (domainSpecificSettings.size === 0) {
      if (requestedDomains.length === 0) {
         console.log('[REFRESH] No domains requested for refresh.');
      } else {
         console.log('[REFRESH] No domain-specific scraper overrides configured.');
      }
   } else {
      for (const [domain, domainSettings] of domainSpecificSettings.entries()) {
         const overrideScraper = describeScraperType(domainSettings.scraper_type);
         const apiState = describeScrapingApiState(domainSettings);
         console.log(`[REFRESH] Override for ${domain}: ${overrideScraper} (${apiState})`);
      }
   }

   const fallbackDomains = requestedDomains.filter((domain) => !domainSpecificSettings.has(domain));
   if (fallbackDomains.length > 0) {
      fallbackDomains.forEach((domain) => {
         console.log(`[REFRESH] Domain ${domain} using global scraper fallback: ${fallbackScraper}`);
      });
   } else if (requestedDomains.length > 0 && domainSpecificSettings.size > 0) {
      console.log('[REFRESH] All requested domains use scraper overrides.');
   }
};

const resolveEffectiveSettings = (
   domain: string,
   globalSettings: SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
): SettingsType => domainSpecificSettings.get(domain) ?? globalSettings;

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

   if (domainNames.length > 0) {
      const domains = await Domain.findAll({
         where: { domain: domainNames },
         attributes: ['domain', 'scrapeEnabled', 'scraper_settings'],
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

               domainSpecificSettings.set(domainPlain.domain, effectiveSettings);
            }
         }

         return [domainPlain.domain, isEnabled];
      }));
   }

   logScraperSelectionSummary(settings, domainSpecificSettings, domainNames);

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
            console.log('[ERROR] Failed to update retry queue:', error);
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
               } catch (error) {
                  console.log('[ERROR] Failed to clear updating flag for keyword:', keyword.ID, error);
               }
            }
         }
      }
   } else {
      for (const keyword of eligibleKeywordModels) {
         console.log('START SCRAPE: ', keyword.keyword);
         const updatedkeyword = await refreshAndUpdateKeyword(keyword, settings, domainSpecificSettings);
         updatedKeywords.push(updatedkeyword);
         if (keywords.length > 0 && settings.scrape_delay && settings.scrape_delay !== '0') {
            const delay = parseInt(settings.scrape_delay, 10);
            if (!isNaN(delay) && delay > 0) {
               await sleep(Math.min(delay, 30000)); // Cap delay at 30 seconds for safety
            }
         }
      }
   }

   const end = performance.now();
   console.log(`time taken: ${end - start}ms`);
   
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
 * @returns {Promise<KeywordType>}
 */
const refreshAndUpdateKeyword = async (
   keyword: Keyword,
   settings: SettingsType,
   domainSpecificSettings: Map<string, SettingsType>,
): Promise<KeywordType> => {
   const currentkeyword = keyword.get({ plain: true });
   const effectiveSettings = resolveEffectiveSettings(currentkeyword.domain, settings, domainSpecificSettings);
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
      console.log('[ERROR] Scraper failed for keyword:', currentkeyword.keyword, scraperError);
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
   } catch (updateError) {
      console.log('[ERROR] Failed to update keyword error status:', updateError);
   }

   try {
      if (effectiveSettings?.scrape_retry) {
         await retryScrape(keyword.ID);
      } else {
         await removeFromRetryQueue(keyword.ID);
      }
   } catch (queueError) {
      console.log('[ERROR] Failed to update retry queue for keyword:', keyword.ID, queueError);
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
         } catch (error) {
            console.warn('[WARNING] Failed to serialise keyword result:', error);
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
         } catch (error) {
            console.warn('[WARNING] Failed to serialise local results:', error);
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
         console.log('[SUCCESS] Updating the Keyword ID:', keyword.ID, 'keyword:', keyword.keyword, 'device:', keyword.device || 'desktop', 'mapPackTop3:', dbPayload.mapPackTop3);

         let parsedError: false | { date: string; error: string; scraper: string } = false;
         if (dbPayload.lastUpdateError !== 'false') {
            try {
               parsedError = JSON.parse(dbPayload.lastUpdateError ?? 'false');
            } catch (parseError) {
               console.log('[WARNING] Failed to parse lastUpdateError:', dbPayload.lastUpdateError, parseError);
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
      } catch (error) {
         console.log('[ERROR] Updating SERP for Keyword', keyword.keyword, error);
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
      } catch (error) {
         console.log('[ERROR] Parallel scrape failed for keyword:', keyword.keyword, error);
         return { keywordId: keyword.ID, result: buildErrorResult(keyword, error), settings: effectiveSettings };
      }
   });

   const resolvedResults = await Promise.all(promises);
   console.log('ALL DONE!!!');
   return resolvedResults;
};

export default refreshAndUpdateKeywords;
