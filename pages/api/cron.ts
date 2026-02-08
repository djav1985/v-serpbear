/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';

import refreshAndUpdateKeywords, { clearKeywordUpdatingFlags, markKeywordsAsUpdating, partitionKeywordsByDomainStatus } from '../../utils/refresh';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { fromDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';

type CRONRefreshRes = {
   started: boolean
   error?: string|null,
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'POST') {
      return cronRefreshkeywords(req, res);
   }
   return res.status(405).json({ error: 'Method not allowed' });
}

export default withApiLogging(handler, { name: 'cron' });

const cronRefreshkeywords = async (req: NextApiRequest, res: NextApiResponse<CRONRefreshRes>) => {
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         logger.warn('Cron refresh skipped: Scraper not configured');
         return res.status(400).json({ started: false, error: 'Scraper has not been set up yet.' });
      }
      const domainToggles = await Domain.findAll({ attributes: ['domain', 'scrapeEnabled'] });
      const enabledDomains = domainToggles
         .map((dom) => dom.get({ plain: true }))
         .filter((dom) => fromDbBool(dom.scrapeEnabled))
         .map((dom) => dom.domain);

      if (enabledDomains.length === 0) {
         logger.warn('Cron refresh skipped: No domains have scraping enabled');
         return res.status(200).json({ started: false, error: 'No domains have scraping enabled.' });
      }

      logger.info(`Cron refresh started for ${enabledDomains.length} domains`);
      
      // Enqueue each domain separately to allow parallel processing
      // The queue will process up to maxConcurrency domains in parallel
      // while ensuring the same domain is never processed twice simultaneously
      for (const domain of enabledDomains) {
         // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
         const uniqueId = crypto.randomUUID();
         refreshQueue.enqueue(
            `cron-refresh-${domain}-${uniqueId}`,
            async () => {
               await processSingleDomain(domain, settings);
            },
            domain // Pass domain for per-domain locking
         ).catch((queueError) => {
            logger.error(`[CRON] ERROR enqueueing refresh task for ${domain}: `, queueError instanceof Error ? queueError : new Error(String(queueError)));
         });
      }

      return res.status(200).json({ started: true });
   } catch (error) {
      logger.error('Error starting cron refresh', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ started: false, error: 'Error Starting the Cron Job' });
   }
};

/**
 * Process a single domain's keywords.
 * This function is called for each domain independently, allowing parallel processing
 * while the queue ensures no domain is processed twice simultaneously.
 */
const processSingleDomain = async (domain: string, settings: SettingsType): Promise<void> => {
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
      } = await partitionKeywordsByDomainStatus(keywordQueries);

      keywordsToRefresh = eligibleKeywords;

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
      await refreshAndUpdateKeywords(keywordsToRefresh, settings);
      
      logger.info(`Completed processing domain: ${domain}`);
   } catch (domainError) {
      logger.error(`Error processing domain: ${domain}`, domainError instanceof Error ? domainError : new Error(String(domainError)));
      
      // Ensure flags are cleared on error for this domain
      try {
         await clearKeywordUpdatingFlags(keywordsToRefresh, 'after domain refresh error', {
            domain,
            keywordIds: keywordsToRefresh.map((keyword) => keyword.ID),
         }, false, 'refresh-error');
      } catch (updateError) {
         logger.error(`Failed to clear updating flags for domain: ${domain}`, updateError instanceof Error ? updateError : new Error(String(updateError)));
      }
      
      throw domainError; // Re-throw to be logged by queue
   }
};
