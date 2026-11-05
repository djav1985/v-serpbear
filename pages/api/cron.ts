/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';

import refreshAndUpdateKeywords, { clearKeywordUpdatingFlags, DOMAIN_REFRESH_ATTRIBUTES, markKeywordsAsUpdating, partitionKeywordsByDomainStatus } from '../../utils/refresh';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { fromDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';
import { errorResponse } from '../../utils/api/response';
import { isKeywordUpdating } from '../../utils/keywordUpdating';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'POST') {
      return cronRefreshkeywords(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'cron' });

const cronRefreshkeywords = async (_req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (_req as ExtendedRequest).requestId;
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         logger.warn('Cron refresh skipped: Scraper not configured');
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Scraper has not been set up yet.', requestId));
      }
      // Load every domain once for this run. Each queued domain reuses these records instead of querying again.
      const domainRecords = await Domain.findAll({ attributes: DOMAIN_REFRESH_ATTRIBUTES });
      const enabledDomains = domainRecords
         .map((dom) => dom.get({ plain: true }))
         .filter((dom) => fromDbBool(dom.scrapeEnabled))
         .map((dom) => dom.domain);

      if (enabledDomains.length === 0) {
         logger.warn('Cron refresh skipped: No domains have scraping enabled');
         // Stays 200: cron.js and scheduled callers treat "nothing to do" as a successful run, not a failure
         return res.status(200).json({ started: false, error: 'No domains have scraping enabled.' });
      }

      // Claim each domain before enqueueing. A domain that is already being refreshed or queued (a manual refresh,
      // or an earlier cron call) is skipped, so a second POST does not queue a duplicate full scrape.
      const releases: Array<() => void> = [];
      const skippedDomains: string[] = [];
      const startedDomains: string[] = [];
      try {
         for (const domain of enabledDomains) {
            const release = refreshQueue.reserveDomains([domain]);
            if (!release) {
               skippedDomains.push(domain);
               continue;
            }
            releases.push(release);
            startedDomains.push(domain);
            // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
            const uniqueId = crypto.randomUUID();
            // Enqueue each domain separately to allow parallel processing
            // The queue will process up to maxConcurrency domains in parallel
            // while ensuring the same domain is never processed twice simultaneously
            refreshQueue.enqueue(
               `cron-refresh-${domain}-${uniqueId}`,
               async () => {
                  await processSingleDomain(domain, settings, domainRecords);
               },
               [domain]
            ).catch((queueError) => {
               logger.error(`[CRON] ERROR enqueueing refresh task for ${domain}: `, queueError instanceof Error ? queueError : new Error(String(queueError)));
            });
         }
      } finally {
         // The tasks are now in the queue (which also locks the domains), or the request failed
         releases.forEach((release) => release());
      }

      if (skippedDomains.length > 0) {
         logger.info('Cron refresh skipped domains that are already being refreshed', { skippedDomains });
      }
      logger.info(`Cron refresh started for ${startedDomains.length} domains`);
      // 200 either way (cron.js treats any 2xx as success); skipped lists what was already running
      return res.status(200).json(skippedDomains.length > 0
         ? { started: startedDomains.length > 0, skipped: { domains: skippedDomains } }
         : { started: true });
   } catch (error) {
      logger.error('Error starting cron refresh', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Starting the Cron Job', requestId));
   }
};

/**
 * Process a single domain's keywords.
 * This function is called for each domain independently, allowing parallel processing
 * while the queue ensures no domain is processed twice simultaneously.
 */
const processSingleDomain = async (domain: string, settings: SettingsType, domainRecords: Domain[]): Promise<void> => {
   let keywordQueries: Keyword[] = [];
   let keywordsToRefresh: Keyword[] = [];
   try {
      logger.info(`Processing domain: ${domain}`);
      
      keywordQueries = await Keyword.findAll({ where: { domain } });
      
      if (keywordQueries.length === 0) {
         logger.info(`No keywords found for domain: ${domain}`);
         return;
      }

      const {
         keywordsToRefresh: eligibleKeywords,
         skippedKeywords,
         missingDomainKeywords,
      } = await partitionKeywordsByDomainStatus(keywordQueries, domainRecords);

      // Keywords a live run is already refreshing are left alone. A stale flag (crashed run) does not count.
      keywordsToRefresh = eligibleKeywords.filter((keyword) => !isKeywordUpdating(keyword));

      if (missingDomainKeywords.length > 0) {
         await clearKeywordUpdatingFlags(missingDomainKeywords, 'for missing domains', {
            domain,
            keywordIds: missingDomainKeywords.map((keyword) => keyword.ID),
         }, false, 'missing-domain');
      }

      if (skippedKeywords.length > 0) {
         await clearKeywordUpdatingFlags(skippedKeywords, 'for skipped keywords', {
            domain,
            keywordIds: skippedKeywords.map((keyword) => keyword.ID),
         }, false, 'scrape-disabled');
      }

      if (keywordsToRefresh.length === 0) {
         logger.info(`No eligible keywords found for domain: ${domain}`);
         return;
      }

      await markKeywordsAsUpdating(keywordsToRefresh, 'before cron refresh', {
         domain,
         keywordIds: keywordsToRefresh.map((keyword) => keyword.ID),
      });
      
      logger.info(`Processing ${keywordsToRefresh.length} keywords for domain: ${domain}`);
      
      // Process this domain's keywords
      await refreshAndUpdateKeywords(keywordsToRefresh, settings, domainRecords);
      
      logger.info(`Completed processing domain: ${domain}`);
   } catch (domainError) {
      logger.error(`Error processing domain: ${domain}`, domainError instanceof Error ? domainError : new Error(String(domainError)));
      
      // Ensure flags are cleared on error for this domain
      try {
         await clearKeywordUpdatingFlags(keywordsToRefresh, 'after domain refresh error', {
            domain,
            keywordIds: keywordsToRefresh.map((keyword) => keyword.ID),
         }, true, 'refresh-error');
      } catch (updateError) {
         logger.error(`Failed to clear updating flags for domain: ${domain}`, updateError instanceof Error ? updateError : new Error(String(updateError)));
      }
      
      throw domainError; // Re-throw to be logged by queue
   }
};
