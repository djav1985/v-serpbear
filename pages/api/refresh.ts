/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import { serializeError } from '../../utils/errorSerialization';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';

type KeywordsRefreshRes = {
   keywords?: KeywordType[]
   message?: string
   keywordCount?: number
   error?: string|null,
}

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
   await db.sync();
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
         return [plain.domain, plain.scrapeEnabled];
      }));

      const keywordsToRefresh = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) === 1);
      const skippedKeywords = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) === 0);

      if (skippedKeywords.length > 0) {
         const skippedIds = skippedKeywords.map((keyword) => keyword.ID);
         await Keyword.update(
            { updating: 0 },
            { where: { ID: { [Op.in]: skippedIds } } },
         );
      }

      if (keywordsToRefresh.length === 0) {
         return res.status(200).json({ keywords: [] });
      }

      const keywordIdsToRefresh = keywordsToRefresh.map((keyword) => keyword.ID);
      await Keyword.update(
         { updating: 1 },
         { where: { ID: { [Op.in]: keywordIdsToRefresh } } },
      );

      logger.info(`Processing ${keywordsToRefresh.length} keywords for ${req.query.id === 'all' ? `domain: ${domain}` :
         `IDs: ${keywordIdsToRefresh.join(',')}`}`);

      // Start background refresh without awaiting
      // Success: refreshAndUpdateKeywords clears 'updating' flags internally after completion
      // Error: catch handler below ensures flags are cleared to prevent UI spinner getting stuck
      refreshAndUpdateKeywords(keywordsToRefresh, settings).catch((refreshError) => {
         const message = serializeError(refreshError);
         logger.error('[REFRESH] ERROR refreshAndUpdateKeywords: ', { data: message, keywordIds: keywordIdsToRefresh });
         // Ensure flags are cleared on error
         Keyword.update(
            { updating: 0 },
            { where: { ID: { [Op.in]: keywordIdsToRefresh } } },
         ).catch((updateError) => {
            logger.error('[REFRESH] Failed to clear updating flags after error: ', { data: serializeError(updateError) });
         });
      });

      // Return immediately with 202 Accepted status
      return res.status(202).json({ 
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
         sticky: 0,
         history: {},
         lastResult: [],
         url: '',
         tags: [],
         updating: 0,
         lastUpdateError: false,
         mapPackTop3: 0,
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
