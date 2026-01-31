/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import { serializeError } from '../../utils/errorSerialization';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { toDbBool } from '../../utils/dbBooleans';
import normalizeDomainBooleans from '../../utils/normalizeDomain';
import { refreshQueue } from '../../utils/refreshQueue';

type BackgroundKeywordsRefreshRes = {
   // 202 Accepted: background execution started, no keywords returned yet
   message: string;
   keywordCount: number;
   keywords?: never;
   error?: string | null;
};

type ImmediateKeywordsRefreshRes = {
   // 200 OK: refresh completed immediately and returns keywords (possibly empty)
   keywords: KeywordType[];
   message?: string;
   keywordCount?: number;
   error?: string | null;
};

type KeywordsRefreshErrorRes = {
   // Error responses (e.g., 400) that only carry an error message
   error: string | null;
   keywords?: never;
   message?: never;
   keywordCount?: never;
};

type KeywordsRefreshRes =
   | BackgroundKeywordsRefreshRes
   | ImmediateKeywordsRefreshRes
   | KeywordsRefreshErrorRes;
type KeywordSearchResultRes = {
   searchResult?: {
      results: { title: string, url: string, position: number }[],
      keyword: string,
      position: number,
      country: string,
      device: string,
   },
   error?: string|null,
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'GET') {
      return getKeywordSearchResults(req, res);
   }
   if (req.method === 'POST') {
      return refreshTheKeywords(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const refreshTheKeywords = async (req: NextApiRequest, res: NextApiResponse<KeywordsRefreshRes>) => {
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json({ error: 'keyword ID is Required!' });
   }
   if (req.query.id === 'all' && !req.query.domain) {
      return res.status(400).json({ error: 'When Refreshing all Keywords of a domian, the Domain name Must be provided.' });
   }
   const keywordIDs = req.query.id !== 'all' && (req.query.id as string).split(',').map((item) => {
      const id = parseInt(item, 10);
      return isNaN(id) ? 0 : id;
   }).filter(id => id > 0);
   const { domain } = req.query || {};
   logger.debug('keywordIDs: ', { data: keywordIDs });

   if (req.query.id !== 'all' && (!keywordIDs || keywordIDs.length === 0)) {
      return res.status(400).json({ error: 'No valid keyword IDs provided' });
   }

   try {
      const settings = await getAppSettings();
      
      if (!settings || (settings && settings.scraper_type === 'none')) {
         logger.debug('Scraper not configured');
         return res.status(400).json({ error: 'Scraper has not been set up yet.' });
      }
      const query = req.query.id === 'all' && domain ? { domain } : { ID: { [Op.in]: keywordIDs } };
      const keywordQueries: Keyword[] = await Keyword.findAll({ where: query });

      if (keywordQueries.length === 0) {
         return res.status(404).json({ error: 'No keywords found for the provided filters.' });
      }

      const domainNames = Array.from(new Set(keywordQueries.map((keyword) => keyword.domain).filter(Boolean)));
      const domainRecords = await Domain.findAll({ where: { domain: domainNames }, attributes: ['domain', 'scrapeEnabled'] });
      const scrapeEnabledMap = new Map(domainRecords.map((record) => {
         const plain = record.get({ plain: true }) as DomainType;
         const normalizedDomain = normalizeDomainBooleans(plain);
         return [normalizedDomain.domain, normalizedDomain.scrapeEnabled];
      }));

      // Separate keywords into three categories:
      // 1. Keywords with domains that exist and have scraping enabled
      // 2. Keywords with domains that exist and have scraping disabled
      // 3. Keywords with domains that don't exist in the Domain table (error case)
      const keywordsToRefresh = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) === true);
      const skippedKeywords = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) === false);
      const missingDomainKeywords = keywordQueries.filter((keyword) => !scrapeEnabledMap.has(keyword.domain));

      // Handle keywords whose domain is missing from the Domain table
      if (missingDomainKeywords.length > 0) {
         const missingDomains = Array.from(new Set(missingDomainKeywords.map((kw) => kw.domain)));
         logger.error('Keywords found with domains not in Domain table', {
            domains: missingDomains,
            keywordCount: missingDomainKeywords.length,
            keywordIds: missingDomainKeywords.map((kw) => kw.ID),
         });
         
         // Clear updating flags for these keywords
         await Promise.all(
            missingDomainKeywords.map(async (keyword) => {
               await keyword.update({ updating: toDbBool(false), updatingStartedAt: null });
               if (typeof keyword.reload === 'function') {
                  await keyword.reload();
               }
            }),
         );
         
         // Remove missing domain keywords from retry queue
         const missingKeywordIds = new Set(missingDomainKeywords.map((kw) => kw.ID));
         if (missingKeywordIds.size > 0) {
            const { retryQueueManager } = await import('../../utils/retryQueueManager');
            await retryQueueManager.removeBatch(missingKeywordIds).catch((error) => {
               logger.error('Failed to remove missing domain keywords from retry queue', error instanceof Error ? error : new Error(String(error)));
            });
         }
         
         // Return error if all keywords have missing domains
         if (keywordsToRefresh.length === 0 && skippedKeywords.length === 0) {
            return res.status(400).json({ 
               error: `Domains not found in database: ${missingDomains.join(', ')}. Please ensure domains are created before adding keywords.`,
            });
         }
      }

      if (skippedKeywords.length > 0) {
         await Promise.all(
            skippedKeywords.map(async (keyword) => {
               await keyword.update({ updating: toDbBool(false), updatingStartedAt: null });
               if (typeof keyword.reload === 'function') {
                  await keyword.reload();
               }
            }),
         );
      }

      if (keywordsToRefresh.length === 0) {
         return res.status(200).json({ keywords: [] });
      }

      // Check if any of the domains being refreshed are locked
      const domainsToRefresh = Array.from(new Set(keywordsToRefresh.map((keyword) => keyword.domain).filter(Boolean)));
      const lockedDomains = domainsToRefresh.filter((domain) => refreshQueue.isDomainLocked(domain));
      
      if (lockedDomains.length > 0) {
         logger.info(`Manual refresh rejected: domains already being refreshed`, { domains: lockedDomains });
         return res.status(409).json({ 
            error: `Domains are already being refreshed: ${lockedDomains.join(', ')}. Please wait for the current refresh to complete.`,
         });
      }

      // Use the first domain only for task association; the manual refresh itself may span multiple domains
      const refreshDomain = domainsToRefresh[0];

      const keywordIdsToRefresh = keywordsToRefresh.map((keyword) => keyword.ID);
      const now = new Date().toJSON();
      await Promise.all(
         keywordsToRefresh.map(async (keyword) => {
            await keyword.update({ updating: toDbBool(true), lastUpdateError: 'false', updatingStartedAt: now });
            if (typeof keyword.reload === 'function') {
               await keyword.reload();
            }
         }),
      );

      // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
      const uniqueId = crypto.randomUUID();
      const taskId = req.query.id === 'all' 
         ? `manual-refresh-domain-${domain}-${uniqueId}` 
         : `manual-refresh-ids-${keywordIdsToRefresh.join(',')}-${uniqueId}`;
      logger.info(`Manual refresh enqueued: ${taskId} (${keywordsToRefresh.length} keywords)`, { domain: refreshDomain });

      // Enqueue the manual refresh task with domain for per-domain locking
      // This prevents the same domain from being refreshed multiple times simultaneously
      // but allows different domains to process in parallel
      refreshQueue.enqueue(
         taskId,
         async () => {
            try {
               await refreshAndUpdateKeywords(keywordsToRefresh, settings);
            } catch (refreshError) {
               const message = serializeError(refreshError);
               logger.error('[REFRESH] ERROR refreshAndUpdateKeywords: ', refreshError instanceof Error ? refreshError : new Error(message), { keywordIds: keywordIdsToRefresh });
               // Ensure flags are cleared on error
               await Promise.all(
                  keywordsToRefresh.map(async (keyword) => {
                     await keyword.update({ updating: toDbBool(false), updatingStartedAt: null });
                     if (typeof keyword.reload === 'function') {
                        await keyword.reload();
                     }
                  }),
               ).catch((updateError) => {
                  logger.error('[REFRESH] Failed to clear updating flags after error: ', updateError instanceof Error ? updateError : new Error(String(updateError)));
               });
               throw refreshError; // Re-throw to be caught by queue error handler
            }
         },
         refreshDomain // Pass domain for per-domain locking
      ).catch((queueError) => {
         logger.error('[REFRESH] ERROR enqueueing refresh task: ', queueError instanceof Error ? queueError : new Error(String(queueError)));
      });

      // Return immediately with 200 OK status
      return res.status(200).json({ 
         message: 'Refresh started',
         keywordCount: keywordsToRefresh.length,
      });
   } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.debug('[REFRESH] ERROR refreshTheKeywords: ', { data: errorMessage });
      return res.status(400).json({ error: errorMessage });
   }
};

const getKeywordSearchResults = async (req: NextApiRequest, res: NextApiResponse<KeywordSearchResultRes>) => {
   if (!req.query.keyword || !req.query.country || !req.query.device) {
      return res.status(400).json({ error: 'A Valid keyword, Country Code, and device is Required!' });
   }
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         return res.status(400).json({ error: 'Scraper has not been set up yet.' });
      }
      const requestedDevice = typeof req.query.device === 'string' ? req.query.device : 'desktop';
      const dummyKeyword:KeywordType = {
         ID: 99999999999999,
         keyword: req.query.keyword as string,
         device: requestedDevice,
         country: req.query.country as string,
         domain: '',
         lastUpdated: '',
         volume: 0,
         added: '',
         position: 111,
         sticky: false,
         history: {},
         lastResult: [],
         url: '',
         tags: [],
         updating: false,
         lastUpdateError: false,
         mapPackTop3: false,
      };
      const scrapeResult = await scrapeKeywordFromGoogle(dummyKeyword, settings);
      if (scrapeResult && !scrapeResult.error) {
         const searchResult = {
            results: scrapeResult.result,
            keyword: scrapeResult.keyword,
            position: scrapeResult.position !== 111 ? scrapeResult.position : 0,
            country: req.query.country as string,
            device: requestedDevice,
         };
         return res.status(200).json({ error: '', searchResult });
      }
      return res.status(400).json({ error: 'Error Scraping Search Results for the given keyword!' });
   } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.debug('ERROR getKeywordSearchResults: ', { data: errorMessage });
      return res.status(400).json({ error: errorMessage });
   }
};

export default withApiLogging(handler, { name: 'refresh' });
