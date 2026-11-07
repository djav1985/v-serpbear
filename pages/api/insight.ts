/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCountryInsight, getKeywordsInsight, getPagesInsight } from '../../utils/insight';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../utils/searchConsole';
import { SAFE_DOMAIN_NAME } from '../../utils/domainSlug';
import verifyUser from '../../utils/verifyUser';
import Domain from '../../database/models/domain';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getDomainSearchConsoleInsight(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'insight' });

const getDomainSearchConsoleInsight = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.domain || typeof req.query.domain !== 'string') return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Missing.', requestId));
   const requestedDomain = req.query.domain.trim().toLowerCase();
   if (!SAFE_DOMAIN_NAME.test(requestedDomain)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Missing.', requestId));
   }
   const foundDomain: Domain | null = await Domain.findOne({ where: { domain: requestedDomain } });
   if (!foundDomain) {
      return res.status(404).json(errorResponse('NOT_FOUND', 'Domain not found.', requestId));
   }
   const domainObj: DomainType = foundDomain.get({ plain: true });
   const domainname = domainObj.domain;
   const getInsightFromSCData = (localSCData: SCDomainDataType): InsightDataType => {
      const { stats = [] } = localSCData;
      const countries = getCountryInsight(localSCData);
      const keywords = getKeywordsInsight(localSCData);
      const pages = getPagesInsight(localSCData);
      return { pages, keywords, countries, stats };
   };

   // First try and read the  Local SC Domain Data file.
   const localSCData = await readLocalSCData(domainname);

   if (localSCData) {
      const oldFetchedDate = localSCData.lastFetched;
      const fetchTimeDiff = new Date().getTime() - (oldFetchedDate ? new Date(oldFetchedDate as string).getTime() : 0);
      // A fetch within 24 hours is fresh, even when it found no rows (a site with no recent clicks).
      // A fetch that recorded an error is not: it is retried instead of serving its empty windows as a success.
      if (oldFetchedDate && !localSCData.lastFetchError && fetchTimeDiff <= 86400000) {
         const response = getInsightFromSCData(localSCData);
         return res.status(200).json({ data: response });
      }
   }

   // If the Local SC Domain Data file does not exist, fetch from Googel Search Console.
   try {
      const scDomainAPI = domainObj?.search_console ? await getSearchConsoleApiInfo(domainObj) : { client_email: '', private_key: '' };
      const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
      if (!(scDomainAPI.client_email && scDomainAPI.private_key)
          && !(scGlobalAPI.client_email && scGlobalAPI.private_key)) {
         // Stays 200: "not integrated" is a normal state the pages render from the error field, not a failure
         return res.status(200).json({ data: null, error: 'Google Search Console is not Integrated.' });
      }
      const scData = await fetchDomainSCData(domainObj, scDomainAPI, scGlobalAPI);
      if (scData && ((scData.thirtyDays && scData.thirtyDays.length) || !scData.lastFetchError)) {
         const response = getInsightFromSCData(scData);
         return res.status(200).json({ data: response });
      }
      return res.status(502).json(errorResponse('BAD_GATEWAY', 'Error Fetching Stats from Google Search Console.', requestId));
   } catch (error) {
      logger.error(`Error getting domain insight for: ${domainname}`, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Internal error fetching Search Console stats.', requestId));
   }
};
