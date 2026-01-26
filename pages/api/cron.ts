/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';

import refreshAndUpdateKeywords from '../../utils/refresh';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';

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
         .filter((dom) => dom.scrapeEnabled === 1)
         .map((dom) => dom.domain);

      if (enabledDomains.length === 0) {
         logger.warn('Cron refresh skipped: No domains have scraping enabled');
         return res.status(200).json({ started: false, error: 'No domains have scraping enabled.' });
      }

      await Keyword.update(
         { updating: 1 },
         { where: { domain: { [Op.in]: enabledDomains } } },
      );
      const keywordQueries: Keyword[] = await Keyword.findAll({ where: { domain: enabledDomains } });

      logger.info(`Cron refresh started for ${enabledDomains.length} domains with ${keywordQueries.length} keywords`);
      
      // Start background refresh without awaiting
      // Success: refreshAndUpdateKeywords clears 'updating' flags internally after completion
      // Error: catch handler below ensures flags are cleared to prevent keywords getting stuck
      const keywordIds = keywordQueries.map((k) => k.ID);
      refreshAndUpdateKeywords(keywordQueries, settings).catch((refreshError) => {
         logger.error('[CRON] ERROR refreshAndUpdateKeywords: ', refreshError instanceof Error ? refreshError : new Error(String(refreshError)));
         // Ensure flags are cleared on error
         Keyword.update(
            { updating: 0 },
            { where: { ID: { [Op.in]: keywordIds } } },
         ).catch((updateError) => {
            logger.error('[CRON] Failed to clear updating flags after error: ', updateError instanceof Error ? updateError : new Error(String(updateError)));
         });
      });

      return res.status(200).json({ started: true });
   } catch (error) {
      logger.error('Error starting cron refresh', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ started: false, error: 'Error Starting the Cron Job' });
   }
};
