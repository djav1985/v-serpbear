/// <reference path="../types.d.ts" />

import { performance } from 'perf_hooks';
import { setTimeout as sleep } from 'timers/promises';
import { Op } from 'sequelize';
import { readFile, writeFile } from 'fs/promises';
import { RefreshResult, removeFromRetryQueue, retryScrape, scrapeKeywordFromGoogle } from './scraper';
import parseKeywords from './parseKeywords';
import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { serializeError } from './errorSerialization';

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

   if (domainNames.length > 0) {
      const domains = await Domain.findAll({ where: { domain: domainNames }, attributes: ['domain', 'scrape_enabled'] });
      scrapePermissions = new Map(domains.map((domain) => {
         const domainPlain = domain.get({ plain: true }) as DomainType;
         return [domainPlain.domain, domainPlain.scrape_enabled !== false];
      }));
   }

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

   if (['scrapingant', 'serpapi', 'searchapi'].includes(settings.scraper_type)) {
      const refreshedResults = await refreshParallel(keywords, settings);
      if (refreshedResults.length > 0) {
         for (const keyword of rawkeyword) {
            const refreshedkeywordData = refreshedResults.find((k) => k && k.ID === keyword.ID);
            if (refreshedkeywordData) {
               const updatedkeyword = await updateKeywordPosition(keyword, refreshedkeywordData, settings);
               updatedKeywords.push(updatedkeyword);
            }
         }
      }
   } else {
      for (const keyword of eligibleKeywordModels) {
         console.log('START SCRAPE: ', keyword.keyword);
         const updatedkeyword = await refreshAndUpdateKeyword(keyword, settings);
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
   return updatedKeywords;
};

/**
 * Scrape Serp for given keyword and update the position in DB.
 * @param {Keyword} keyword - Keywords to scrape
 * @param {SettingsType} settings - The App Settings that contain the Scraper settings
 * @returns {Promise<KeywordType>}
 */
const refreshAndUpdateKeyword = async (keyword: Keyword, settings: SettingsType): Promise<KeywordType> => {
   const currentkeyword = keyword.get({ plain: true });
   let refreshedkeywordData: RefreshResult | false = false;
   let scraperError: string | false = false;

   try {
      refreshedkeywordData = await scrapeKeywordFromGoogle(currentkeyword, settings);
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
   } finally {
      // Always ensure updating is set to false, regardless of success or failure
      try {
         const updateData: any = { updating: false };

         // If there was an error, save it to lastUpdateError
         if (scraperError) {
            const theDate = new Date();
            updateData.lastUpdateError = JSON.stringify({
               date: theDate.toJSON(),
               error: scraperError,
               scraper: settings.scraper_type,
            });
         }

         await keyword.update(updateData);
      } catch (updateError) {
         console.log('[ERROR] Failed to update keyword updating status:', updateError);
      }
   }

   const updatedkeyword = refreshedkeywordData ? await updateKeywordPosition(keyword, refreshedkeywordData, settings) : currentkeyword;
   return updatedkeyword;
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
         history: JSON.stringify(history),
         lastUpdated: lastUpdatedValue,
         lastUpdateError: lastUpdateErrorValue,
         map_pack_top3: updatedKeyword.mapPackTop3 === true,
      };

      if (updatedKeyword.error && settings?.scrape_retry) {
         await retryScrape(keyword.ID);
      } else {
         await removeFromRetryQueue(keyword.ID);
      }

      try {
         await keywordRaw.update(dbPayload);
         console.log('[SUCCESS] Updating the Keyword: ', keyword.keyword);

         let parsedError: false | { date: string; error: string; scraper: string } = false;
         if (dbPayload.lastUpdateError !== 'false') {
            try {
               parsedError = JSON.parse(dbPayload.lastUpdateError ?? 'false');
            } catch (parseError) {
               console.log('[WARNING] Failed to parse lastUpdateError:', dbPayload.lastUpdateError);
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
            history,
            lastUpdated: effectiveLastUpdated,
            lastUpdateError: parsedError,
            mapPackTop3: dbPayload.map_pack_top3 === true,
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
const refreshParallel = async (keywords:KeywordType[], settings:SettingsType) : Promise<RefreshResult[]> => {
   const promises: Promise<RefreshResult>[] = keywords.map((keyword) => scrapeKeywordFromGoogle(keyword, settings));

   return Promise.all(promises).then((promiseData) => {
      console.log('ALL DONE!!!');
      return promiseData;
   }).catch((err) => {
      console.log(err);
      return [];
   });
};

export default refreshAndUpdateKeywords;
