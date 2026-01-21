/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';
import { serializeError } from '../../utils/errorSerialization';
import { logger } from '../../utils/logger';

type KeywordsRefreshRes = {
   keywords?: KeywordType[]
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
         return [plain.domain, plain.scrapeEnabled !== false];
      }));

      const keywordsToRefresh = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) !== false);
      const skippedKeywords = keywordQueries.filter((keyword) => scrapeEnabledMap.get(keyword.domain) === false);

      if (skippedKeywords.length > 0) {
         const skippedIds = skippedKeywords.map((keyword) => keyword.ID);
         await Keyword.update(
            { updating: false },
            { where: { ID: { [Op.in]: skippedIds } } },
         );
      }

      if (keywordsToRefresh.length === 0) {
         return res.status(200).json({ keywords: [] });
      }

      const keywordIdsToRefresh = keywordsToRefresh.map((keyword) => keyword.ID);
      await Keyword.update(
         { updating: true },
         { where: { ID: { [Op.in]: keywordIdsToRefresh } } },
      );

      logger.info(`Processing ${keywordsToRefresh.length} keywords for ${req.query.id === 'all' ? `domain: ${domain}` :
         `IDs: ${keywordIdsToRefresh.join(',')}`}`);

      let keywords = [];

      try {
         // For single keyword, wait for completion to return accurate data immediately
         if (keywordIdsToRefresh.length === 1) {
            const refreshed: KeywordType[] = await refreshAndUpdateKeywords(keywordsToRefresh, settings);
            keywords = refreshed;
         } else {
            // For multiple keywords, start refresh in background for progressive updates
            // This allows the dashboard to poll and see updates as they complete
            refreshAndUpdateKeywords(keywordsToRefresh, settings).catch((refreshError) => {
               const message = serializeError(refreshError);
               logger.debug('[REFRESH] ERROR refreshAndUpdateKeywords (background): ', { data: message });
            });
            
            // Fetch updated state to return accurate baseline data with updating flag set
            // The refresh process will update DB as it progresses, and polling will pick it up
            const refreshedKeywordRecords = await Keyword.findAll({
               where: { ID: { [Op.in]: keywordIdsToRefresh } },
            });
            const plainKeywords = refreshedKeywordRecords.map((keyword) => keyword.get({ plain: true }));
            keywords = parseKeywords(plainKeywords);
         }
      } catch (refreshError) {
         const message = serializeError(refreshError);
         logger.debug('[REFRESH] ERROR refreshAndUpdateKeywords (single keyword): ', { data: message });
         return res.status(500).json({ error: message });
      }

      return res.status(200).json({ keywords });
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
