/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { maskDomainScraperSettings, parseDomainScraperSettings } from '../../utils/domainScraperSettings';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { maskSearchConsole } from '../../utils/maskSearchConsole';
import normalizeDomainBooleans from '../../utils/normalizeDomain';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'GET') {
      return getDomain(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'domain' });

const getDomain = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.domain || typeof req.query.domain !== 'string') {
       return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain Name is Required!', requestId));
   }

   try {
      const query = { domain: (req.query.domain as string).trim().toLowerCase() };
      const foundDomain:Domain| null = await Domain.findOne({ where: query });

      if (!foundDomain) {
         return res.status(404).json(errorResponse('NOT_FOUND', 'Domain not found', requestId));
      }

      const parsedDomain = foundDomain.get({ plain: true }) as DomainType & { scraper_settings?: any };

      if (parsedDomain.search_console) {
         // The Search Console key stays on the server: only a 'true' marker says whether credentials are saved.
         parsedDomain.search_console = JSON.stringify(maskSearchConsole(parsedDomain.search_console, String(parsedDomain.domain || parsedDomain.ID || '')));
      }

      const parsedScraperSettings = maskDomainScraperSettings(
         parseDomainScraperSettings(parsedDomain?.scraper_settings),
      );
      parsedDomain.scraper_settings = parsedScraperSettings;

      return res.status(200).json({ domain: normalizeDomainBooleans(parsedDomain) });
   } catch (error) {
      logger.error('Getting Domain: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Loading Domain', requestId));
   }
};
