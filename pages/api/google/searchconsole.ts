/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Domain from '../../../database/models/domain';
import { logger } from '../../../utils/logger';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../../utils/searchConsole';
import { SAFE_DOMAIN_NAME } from '../../../utils/domainSlug';
import verifyUser from '../../../utils/verifyUser';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getDomainSearchConsoleData(req, res);
   }
   if (req.method === 'POST') {
      return cronRefreshSearchConsoleData(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

const getDomainSearchConsoleData = async (req: NextApiRequest, res: NextApiResponse) => {
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
   const localSCData = await readLocalSCData(domainname);
   // Fresh means fetched within the last 24 hours. Empty windows are valid (a site with no recent clicks),
   // so they must not force a new Google request on every page load.
   const isFresh = !!localSCData && !!localSCData.lastFetched
      && Array.isArray(localSCData.threeDays) && Array.isArray(localSCData.sevenDays) && Array.isArray(localSCData.thirtyDays)
      && (new Date().getTime() - new Date(localSCData.lastFetched).getTime() <= 86400000);
   if (isFresh) {
      return res.status(200).json({ data: localSCData });
   }
   try {
      const scDomainAPI = domainObj?.search_console ? await getSearchConsoleApiInfo(domainObj) : { client_email: '', private_key: '' };
      const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
      if (!(scDomainAPI.client_email && scDomainAPI.private_key)
          && !(scGlobalAPI.client_email && scGlobalAPI.private_key)) {
         // Stays 200: "not integrated" is a normal state the pages render from the error field, not a failure
         return res.status(200).json({ data: null, error: 'Google Search Console is not Integrated.' });
      }
      const scData = await fetchDomainSCData(domainObj, scDomainAPI, scGlobalAPI);
      if (scData && scData.thirtyDays && scData.thirtyDays.length) {
         return res.status(200).json({ data: scData });
      }
      // The request was valid; Google returned nothing usable, so this is an upstream failure
      return res.status(502).json(errorResponse('BAD_GATEWAY', 'Error Fetching Data from Google Search Console.', requestId));
   } catch (error) {
      logger.error('Error getting Search Console data for domain', error instanceof Error ? error : new Error(String(error)), { domain: domainname });
      return res.status(502).json(errorResponse('BAD_GATEWAY', 'Error Fetching Data from Google Search Console.', requestId));
   }
};

const cronRefreshSearchConsoleData = async (_req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (_req as ExtendedRequest).requestId;
   try {
      const allDomainsRaw = await Domain.findAll();
      const Domains: DomainType[] = allDomainsRaw.map((el) => el.get({ plain: true }));
      let updatedCount = 0;
      let failedCount = 0;
      for (const domain of Domains) {
         try {
            const scDomainAPI = domain.search_console ? await getSearchConsoleApiInfo(domain) : { client_email: '', private_key: '' };
            const scGlobalAPI = await getSearchConsoleApiInfo({} as DomainType);
            if (scDomainAPI.client_email || scGlobalAPI.client_email) {
               const scData = await fetchDomainSCData(domain, scDomainAPI, scGlobalAPI);
               if (scData && scData.thirtyDays && scData.thirtyDays.length) {
                  logger.info(`Updated Search Console data for domain: ${domain.domain}`);
               } else {
                  logger.error(`Failed to update Search Console data for domain: ${domain.domain}`);
               }
               // A site with no recent data is still a successful fetch; only a missing result or a recorded fetch error is a failure
               if (scData && !scData.lastFetchError) {
                  updatedCount += 1;
               } else {
                  failedCount += 1;
               }
            } else {
               logger.debug(`No Search Console API credentials found for domain: ${domain.domain}`);
            }
         } catch (domainError) {
            failedCount += 1;
            logger.error(`Failed to update Search Console data for domain: ${domain.domain}`, domainError instanceof Error ? domainError : new Error(String(domainError)));
         }
      }
      // Every domain that was tried failed: report it instead of "completed". Partial failures stay 200 (logged above).
      if (failedCount > 0 && updatedCount === 0) {
         return res.status(502).json(errorResponse('BAD_GATEWAY', 'Failed to update Search Console data for every domain.', requestId));
      }
      return res.status(200).json({ status: 'completed' });
   } catch (error) {
      logger.error('Error in CRON updating Search Console data', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error updating Search Console data.', requestId));
   }
};

export default withApiLogging(handler, { name: 'searchconsole' });
