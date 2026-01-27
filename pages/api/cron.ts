/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';

import refreshAndUpdateKeywords from '../../utils/refresh';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { fromDbBool, toDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';

type CRONRefreshRes = {
   started: boolean
   error?: string|null,
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'POST') {
      return cronRefreshkeywords(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
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
      
      // Enqueue the cron refresh task - it will be processed sequentially with any manual refreshes
      // This ensures only one refresh operation runs at a time across the entire system
      refreshQueue.enqueue('cron-refresh', async () => {
         await processDomainsSequentially(enabledDomains, settings);
      }).catch((queueError) => {
         logger.error('[CRON] ERROR enqueueing refresh task: ', queueError instanceof Error ? queueError : new Error(String(queueError)));
      });

      return res.status(200).json({ started: true });
   } catch (error) {
      logger.error('Error starting cron refresh', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ started: false, error: 'Error Starting the Cron Job' });
   }
};

/**
 * Process domains sequentially to ensure single-writer database access.
 * Each domain's keywords are fully processed before moving to the next domain.
 * This prevents concurrent database writes and ensures data consistency.
 */
const processDomainsSequentially = async (domains: string[], settings: SettingsType): Promise<void> => {
   logger.info(`Starting sequential processing of ${domains.length} domains`);
   
   for (const domain of domains) {
      try {
         logger.info(`Processing domain: ${domain}`);
         
         const now = new Date().toJSON();
         await Keyword.update(
            { updating: toDbBool(true), lastUpdateError: 'false', updatingStartedAt: now },
            { where: { domain } },
         );
         
         const keywordQueries: Keyword[] = await Keyword.findAll({ where: { domain } });
         
         if (keywordQueries.length === 0) {
            logger.info(`No keywords found for domain: ${domain}`);
            continue;
         }
         
         logger.info(`Processing ${keywordQueries.length} keywords for domain: ${domain}`);
         
         // Wait for this domain's keywords to complete before moving to next domain
         await refreshAndUpdateKeywords(keywordQueries, settings);
         
         logger.info(`Completed processing domain: ${domain}`);
      } catch (domainError) {
         logger.error(`Error processing domain: ${domain}`, domainError instanceof Error ? domainError : new Error(String(domainError)));
         
         // Ensure flags are cleared on error for this domain
         try {
            await Keyword.update(
               { updating: toDbBool(false), updatingStartedAt: null },
               { where: { domain } },
            );
         } catch (updateError) {
            logger.error(`Failed to clear updating flags for domain: ${domain}`, updateError instanceof Error ? updateError : new Error(String(updateError)));
         }
         
         // Continue to next domain even if this one failed
         logger.info(`Continuing to next domain after error in: ${domain}`);
      }
   }
   
   logger.info(`Completed sequential processing of all ${domains.length} domains`);
};
