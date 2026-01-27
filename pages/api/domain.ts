/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { maskDomainScraperSettings, parseDomainScraperSettings } from '../../utils/domainScraperSettings';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { safeJsonParse } from '../../utils/safeJsonParse';

type DomainGetResponse = {
   domain?: DomainType | null
   error?: string|null,
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized === 'authorized' && req.method === 'GET') {
      await db.sync();
      return getDomain(req, res);
   }
   return res.status(401).json({ error: authorized });
}

export default withApiLogging(handler, { name: 'domain' });

const getDomain = async (req: NextApiRequest, res: NextApiResponse<DomainGetResponse>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
       return res.status(400).json({ error: 'Domain Name is Required!' });
   }

   try {
      const query = { domain: req.query.domain as string };
      const foundDomain:Domain| null = await Domain.findOne({ where: query });

      if (!foundDomain) {
         return res.status(404).json({ domain: null, error: 'Domain not found' });
      }

      const parsedDomain = foundDomain.get({ plain: true }) as DomainType & { scraper_settings?: any };

      if (parsedDomain.search_console) {
         const cryptr = new Cryptr(process.env.SECRET as string);
         const scData = safeJsonParse<Record<string, string> | null>(
            parsedDomain.search_console,
            null,
            { context: `domain ${parsedDomain.domain || parsedDomain.ID || ''} search_console`, logError: true },
         );
         if (scData) {
            scData.client_email = scData.client_email ? cryptr.decrypt(scData.client_email) : '';
            scData.private_key = scData.private_key ? cryptr.decrypt(scData.private_key) : '';
            parsedDomain.search_console = JSON.stringify(scData);
         }
      }

      const parsedScraperSettings = maskDomainScraperSettings(
         parseDomainScraperSettings(parsedDomain?.scraper_settings),
      );
      parsedDomain.scraper_settings = parsedScraperSettings;

      return res.status(200).json({ domain: parsedDomain });
   } catch (error) {
      logger.error('Getting Domain: ', error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json({ error: 'Error Loading Domain' });
   }
};
