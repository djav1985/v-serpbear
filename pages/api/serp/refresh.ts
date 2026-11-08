/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { Op } from 'sequelize';
import Keyword from '../../../database/models/keyword';
import refreshAndUpdateKeywords, { clearKeywordUpdatingFlags, markKeywordsAsUpdating, partitionKeywordsByDomainStatus } from '../../../utils/refresh';
import { getAppSettings } from '../../../utils/appSettings';
import verifyUser from '../../../utils/verifyUser';
import { scrapeKeywordWithStrategy } from '../../../utils/scraper';
import { serializeError } from '../../../utils/errorSerialization';
import { logger } from '../../../utils/logger';
import { withApiLogging } from '../../../utils/apiLogging';
import { refreshQueue } from '../../../utils/refreshQueue';
import { errorResponse } from '../../../utils/api/response';
import { takeRateLimitToken } from '../../../utils/rateLimit';
import { getClientIp } from '../../../utils/api/clientIp';
import { isKeywordUpdating } from '../../../utils/keywordUpdating';

/**
 * Parses a comma separated list of keyword IDs. Returns null when any item is not a positive integer,
 * so callers can answer 400 instead of silently dropping bad input.
 */
const parseKeywordIds = (raw: string): number[] | null => {
   const items = raw.split(',').map((item) => item.trim());
   if (items.some((item) => !/^[1-9]\d*$/.test(item))) {
      return null;
   }
   const ids = Array.from(new Set(items.map((item) => Number(item))));
   return ids.every((id) => Number.isSafeInteger(id)) ? ids : null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      if (req.query.status === 'retry') {
         return getRetryStatus(req, res);
      }
      return getKeywordSearchResults(req, res);
   }
   if (req.method === 'POST') {
      return refreshTheKeywords(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

const getRetryStatus = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }

   const keywordIDs = parseKeywordIds(req.query.id);
   if (!keywordIDs) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keyword IDs provided', requestId));
   }

   try {
      const keywords = await Keyword.findAll({
         where: { ID: { [Op.in]: keywordIDs } },
         attributes: ['ID', 'updating', 'updatingStartedAt'],
      });
      return res.status(200).json({
         // A flag left behind by a crashed run is reported as not updating, matching what a refresh would do
         keywords: keywords.map((keyword) => {
            const plainKeyword = keyword.get({ plain: true });
            return { ID: plainKeyword.ID, updating: isKeywordUpdating(plainKeyword) };
         }),
      });
   } catch (error) {
      logger.error('Error reading retry status', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to read retry status', requestId));
   }
};

/**
 * Keyword IDs to refresh: the JSON body `ids` array when sent (null if any item is not a positive integer),
 * otherwise the legacy comma-separated `id` query.
 */
const readKeywordIds = (req: NextApiRequest): number[] | null => {
   if (req.body?.ids !== undefined) {
      const ids: unknown = req.body.ids;
      const valid = Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0);
      return valid ? Array.from(new Set(ids as number[])) : null;
   }
   return typeof req.query.id === 'string' ? parseKeywordIds(req.query.id) : null;
};

const refreshTheKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const idsInBody = req.body?.ids !== undefined;
   if (!idsInBody && (!req.query.id || typeof req.query.id !== 'string')) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   const refreshAll = !idsInBody && req.query.id === 'all';
   if (refreshAll && !req.query.domain) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'When Refreshing all Keywords of a domian, the Domain name Must be provided.', requestId));
   }
   const keywordIDs = refreshAll ? [] : readKeywordIds(req);
   const { domain } = req.query || {};
   if (domain !== undefined && typeof domain !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'domain must be a single domain name.', requestId));
   }
   logger.debug('[SCRAPER] keywordIDs: ', { data: keywordIDs });

   if (!refreshAll && (!keywordIDs || keywordIDs.length === 0)) {
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
         logger.debug('[SCRAPER] Scraper not configured');
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Scraper has not been set up yet.', requestId));
      }
      const query = refreshAll && domain ? { domain } : { ID: { [Op.in]: keywordIDs } };
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
            const { retryQueueManager } = await import('../../../utils/retryQueueManager');
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

      // Keywords a live run is already refreshing are skipped. A stale flag (crashed run) does not count.
      const updatingKeywordIds: number[] = [];
      const candidateKeywords = keywordsToRefresh.filter((keyword) => {
         if (isKeywordUpdating(keyword)) {
            updatingKeywordIds.push(keyword.ID);
            return false;
         }
         return true;
      });

      // Claim each domain on its own. The check and the claim happen in the same tick, so two quick requests
      // cannot both pass it while the keywords are being marked as updating below. A locked domain is skipped
      // and the rest of the request still runs.
      const releases: Array<() => void> = [];
      const claimedDomains = new Set<string>();
      const lockedDomains: string[] = [];
      try {
         const candidateDomains = Array.from(new Set(candidateKeywords.map((keyword) => keyword.domain).filter(Boolean)));
         for (const candidateDomain of candidateDomains) {
            const release = refreshQueue.reserveDomains([candidateDomain]);
            if (release) {
               releases.push(release);
               claimedDomains.add(candidateDomain);
            } else {
               lockedDomains.push(candidateDomain);
            }
         }

         const keywordsToStart = candidateKeywords.filter((keyword) => claimedDomains.has(keyword.domain));
         const lockedKeywordIds = candidateKeywords
            .filter((keyword) => lockedDomains.includes(keyword.domain))
            .map((keyword) => keyword.ID);
         const skipped = {
            domains: lockedDomains,
            keywordIds: [...updatingKeywordIds, ...lockedKeywordIds],
         };

         // 409 only when nothing at all could be started
         if (keywordsToStart.length === 0) {
            logger.debug('[SCRAPER] Manual refresh rejected: nothing could be started', { lockedDomains, updatingKeywordIds });
            const message = lockedDomains.length > 0
               ? `Domains are already being refreshed: ${lockedDomains.join(', ')}. Please wait for the current refresh to complete.`
               : `Keywords are already being refreshed: ${updatingKeywordIds.join(', ')}. Please wait for the current refresh to complete.`;
            return res.status(409).json(errorResponse('CONFLICT', message, requestId));
         }

         const domainsToRefresh = Array.from(claimedDomains);
         const keywordIdsToRefresh = keywordsToStart.map((keyword) => keyword.ID);
         await markKeywordsAsUpdating(keywordsToStart, 'before manual refresh', {
            keywordIds: keywordIdsToRefresh,
         });

         // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
         const uniqueId = crypto.randomUUID();
         const taskId = refreshAll
            ? `manual-refresh-domain-${domain}-${uniqueId}`
            : `manual-refresh-ids-${keywordIdsToRefresh.join(',')}-${uniqueId}`;
         logger.info(`[SCRAPER] Manual refresh enqueued: ${taskId} (${keywordsToStart.length} keywords)`, { domains: domainsToRefresh, skipped });

         // Enqueue the manual refresh task with its domains for per-domain locking
         // This prevents the same domain from being refreshed multiple times simultaneously
         // but allows different domains to process in parallel
         refreshQueue.enqueue(
            taskId,
            async () => {
               try {
                  await refreshAndUpdateKeywords(keywordsToStart, settings);
               } catch (refreshError) {
                  const message = serializeError(refreshError);
                  logger.error('[REFRESH] ERROR refreshAndUpdateKeywords: ', refreshError instanceof Error ? refreshError : new Error(message), { keywordIds: keywordIdsToRefresh });
                  // Ensure flags are cleared on error, only for keywords still in updating state
                  await clearUpdatingFlags(keywordsToStart, 'after refresh error', 'refresh-error', true).catch((updateError) => {
                     logger.error('[REFRESH] Failed to clear updating flags after error: ', updateError instanceof Error ? updateError : new Error(String(updateError)));
                  });
                  throw refreshError; // Re-throw to be caught by queue error handler
               }
            },
            domainsToRefresh
         );

         // Return immediately with 200 OK status; skipped lists what was not started and why
         return res.status(200).json({
            message: 'Refresh started',
            keywordCount: keywordsToStart.length,
            skipped,
         });
      } finally {
         // The tasks are now in the queue (which also locks the domains), or the request failed
         releases.forEach((release) => release());
      }
   } catch (error) {
      logger.error('[REFRESH] ERROR refreshTheKeywords: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to start the refresh.', requestId));
   }
};

const KEYWORD_SEARCHES_PER_MINUTE = 20;

const getKeywordSearchResults = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (typeof req.query.keyword !== 'string' || typeof req.query.country !== 'string' || !req.query.keyword || !req.query.country) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'A Valid keyword and Country Code is Required!', requestId));
   }
   // Each search is a paid provider request, so limit how many one client can start per minute
   const clientKey = `keyword-search:${getClientIp(req)}`;
   if (!takeRateLimitToken(clientKey, KEYWORD_SEARCHES_PER_MINUTE, 60 * 1000)) {
      return res.status(429).json(errorResponse('TOO_MANY_REQUESTS', 'Too many keyword searches. Please wait a minute and try again.', requestId));
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
            results: scrapeResult.result,
            keyword: scrapeResult.keyword,
            position: scrapeResult.position,
            country: req.query.country as string,
            device: requestedDevice,
         };
         return res.status(200).json({ searchResult });
      }
      // The scraper was configured and the request was valid, so a failed scrape is an upstream failure, not a bad request
      logger.warn('Keyword search scrape failed', { error: scrapeResult ? String((scrapeResult as { error?: unknown }).error ?? 'no result') : 'no result' });
      return res.status(502).json(errorResponse('BAD_GATEWAY', 'Error Scraping Search Results for the given keyword!', requestId));
   } catch (error) {
      logger.error('ERROR getKeywordSearchResults: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to search for the keyword.', requestId));
   }
};

export default withApiLogging(handler, { name: 'refresh' });
