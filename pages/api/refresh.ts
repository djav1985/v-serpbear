/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords, { clearKeywordUpdatingFlags, markKeywordsAsUpdating, partitionKeywordsByDomainStatus } from '../../utils/refresh';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import { scrapeKeywordWithStrategy } from '../../utils/scraper';
import { serializeError } from '../../utils/errorSerialization';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { refreshQueue } from '../../utils/refreshQueue';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getKeywordSearchResults(req, res);
   }
   if (req.method === 'POST') {
      return refreshTheKeywords(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

const refreshTheKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   if (req.query.id === 'all' && !req.query.domain) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'When Refreshing all Keywords of a domian, the Domain name Must be provided.', requestId));
   }
   const keywordIDs = req.query.id !== 'all' && (req.query.id as string).split(',').map((item) => {
      const id = parseInt(item, 10);
      return isNaN(id) ? 0 : id;
   }).filter(id => id > 0);
   const { domain } = req.query || {};
   logger.debug('keywordIDs: ', { data: keywordIDs });

   if (req.query.id !== 'all' && (!keywordIDs || keywordIDs.length === 0)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keyword IDs provided', requestId));
   }

   const clearUpdatingFlags = async (keywords: Keyword[], logContext: string, reason: string, onlyWhenUpdating = false) => {
      await clearKeywordUpdatingFlags(keywords, logContext, {
         keywordIds: keywords.map((kw) => kw.ID),
      }, onlyWhenUpdating, reason);
   };

   try {
      const settings = await getAppSettings();
      
      if (!settings || (settings && settings.scraper_type === 'none')) {
         logger.debug('Scraper not configured');
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Scraper has not been set up yet.', requestId));
      }
      const query = req.query.id === 'all' && domain ? { domain } : { ID: { [Op.in]: keywordIDs } };
      const keywordQueries: Keyword[] = await Keyword.findAll({ where: query });

      if (keywordQueries.length === 0) {
         return res.status(404).json(errorResponse('NOT_FOUND', 'No keywords found for the provided filters.', requestId));
      }

      const {
         keywordsToRefresh,
         skippedKeywords,
         missingDomainKeywords,
      } = await partitionKeywordsByDomainStatus(keywordQueries);

      // Handle keywords whose domain is missing from the Domain table
      if (missingDomainKeywords.length > 0) {
         const missingDomains = Array.from(new Set(missingDomainKeywords.map((kw) => kw.domain)));
         logger.error('Keywords found with domains not in Domain table', undefined, {
            domains: missingDomains,
            keywordCount: missingDomainKeywords.length,
            keywordIds: missingDomainKeywords.map((kw) => kw.ID),
         });
         
         // Clear updating flags for these keywords
         await clearUpdatingFlags(missingDomainKeywords, 'for missing domains', 'missing-domain');
         
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
            return res.status(400).json(
               errorResponse('BAD_REQUEST', `Domains not found in database: ${missingDomains.join(', ')}. Please ensure domains are created before adding keywords.`, requestId),
            );
         }
      }

      if (skippedKeywords.length > 0) {
         await clearUpdatingFlags(skippedKeywords, 'for skipped keywords', 'scrape-disabled');
      }

      if (keywordsToRefresh.length === 0) {
         return res.status(200).json({ keywords: [] });
      }

      // Check if any of the domains being refreshed are locked
      const domainsToRefresh = Array.from(new Set(keywordsToRefresh.map((keyword) => keyword.domain).filter(Boolean)));
      const lockedDomains = domainsToRefresh.filter((domain) => refreshQueue.isDomainLocked(domain));
      
      if (lockedDomains.length > 0) {
         logger.info(`Manual refresh rejected: domains already being refreshed`, { domains: lockedDomains });
         return res.status(409).json(
            errorResponse('CONFLICT', `Domains are already being refreshed: ${lockedDomains.join(', ')}. Please wait for the current refresh to complete.`, requestId),
         );
      }

      // Use the first domain only for task association; the manual refresh itself may span multiple domains
      const refreshDomain = domainsToRefresh[0];

      const keywordIdsToRefresh = keywordsToRefresh.map((keyword) => keyword.ID);
      await markKeywordsAsUpdating(keywordsToRefresh, 'before manual refresh', {
         keywordIds: keywordIdsToRefresh,
      });

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
               // Ensure flags are cleared on error, only for keywords still in updating state
               await clearUpdatingFlags(keywordsToRefresh, 'after refresh error', 'refresh-error', true).catch((updateError) => {
                  logger.error('[REFRESH] Failed to clear updating flags after error: ', updateError instanceof Error ? updateError : new Error(String(updateError)));
               });
               throw refreshError; // Re-throw to be caught by queue error handler
            }
         },
         refreshDomain // Pass domain for per-domain locking
      );

      // Return immediately with 200 OK status
      return res.status(200).json({ 
         message: 'Refresh started',
         keywordCount: keywordsToRefresh.length,
      });
   } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.debug('[REFRESH] ERROR refreshTheKeywords: ', { data: errorMessage });
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', errorMessage, requestId));
   }
};

const getKeywordSearchResults = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.keyword || !req.query.country) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'A Valid keyword and Country Code is Required!', requestId));
   }
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Scraper has not been set up yet.', requestId));
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
         position: 0,
         sticky: false,
         history: {},
         lastResult: [],
         url: '',
         tags: [],
         updating: false,
         lastUpdateError: false,
         mapPackTop3: false,
      };
      const scrapeResult = await scrapeKeywordWithStrategy(dummyKeyword, settings);
      if (scrapeResult && !scrapeResult.error) {
         const searchResult = {
            results: scrapeResult.result.filter((r) => !r.skipped),
            keyword: scrapeResult.keyword,
            position: scrapeResult.position,
            country: req.query.country as string,
            device: requestedDevice,
         };
         return res.status(200).json({ searchResult });
      }
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Error Scraping Search Results for the given keyword!', requestId));
   } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.debug('ERROR getKeywordSearchResults: ', { data: errorMessage });
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', errorMessage, requestId));
   }
};

export default withApiLogging(handler, { name: 'refresh' });
