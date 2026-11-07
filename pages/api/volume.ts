/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import Keyword from '../../database/models/keyword';
import { logger } from '../../utils/logger';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';
import { takeRateLimitToken } from '../../utils/rateLimit';
import { getClientIp } from '../../utils/api/clientIp';

// Updating every domain at once (the Settings button) is a paid Google Ads request per country, so it is limited per client.
// Lookups by keyword IDs or for a single domain are not limited here.
const ALL_DOMAIN_LOOKUPS_PER_HOUR = 2;

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method === 'POST') {
      return updatekeywordVolume(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, { name: 'volume' });

const updatekeywordVolume = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (req.body !== undefined && req.body !== null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Request body must be a JSON object.', requestId));
   }
   const { keywords = [], domain: rawDomain = '', update = true } = req.body || {};
   const domain = typeof rawDomain === 'string' ? rawDomain.trim().toLowerCase() : rawDomain;
   if (!Array.isArray(keywords) || !keywords.every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keywords must be a list of keyword IDs.', requestId));
   }
   if (typeof domain !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'domain must be a string.', requestId));
   }
   if (keywords.length === 0 && !domain) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Please provide keyword Ids or a domain name.', requestId));
   }

   if (domain === 'all' && keywords.length === 0) {
      const clientKey = getClientIp(req);
      if (!takeRateLimitToken(`volume-all:${clientKey}`, ALL_DOMAIN_LOOKUPS_PER_HOUR, 60 * 60 * 1000)) {
         return res.status(429).json(errorResponse('TOO_MANY_REQUESTS', 'You can update all domains only 2 times per hour. Please try again later.', requestId));
      }
   }

   try {
      let foundKeywords: Keyword[] = [];
      if (keywords.length > 0) {
         foundKeywords = await Keyword.findAll({ where: { ID: { [Op.in]: keywords } } });
      }
      if (domain && keywords.length === 0) {
         const allDomain = domain === 'all';
         const scope = allDomain ? {} : { where: { domain } };
         foundKeywords = await Keyword.findAll(scope);
      }

      const keywordsToSend = parseKeywords(foundKeywords.map((e) => e.get({ plain: true })));

      if (keywordsToSend.length === 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Error Updating Keywords Volume data', requestId));
      }

      // Google Ads is asked once per country with a pause between countries, so a domain-wide update that spans
      // several countries can take minutes. It runs in the background instead of holding this request open
      // until a proxy times it out. Credentials are checked first, so a setup problem is still reported here.
      const countryCount = new Set(keywordsToSend.map((keywordItem) => keywordItem.country)).size;
      if (update && keywords.length === 0 && countryCount > 1) {
         const preflight = await getKeywordsVolume([]);
         if (preflight.error || preflight.volumes === false) {
            return res.status(400).json(errorResponse('BAD_REQUEST', preflight.error || 'Error Fetching Keywords Volume Data from Google Ads', requestId));
         }
         getKeywordsVolume(keywordsToSend)
            .then((backgroundVolumes) => {
               if (backgroundVolumes.volumes === false) {
                  logger.error('Background keyword volume update failed', new Error(backgroundVolumes.error || 'Google Ads volume lookup failed'));
                  return undefined;
               }
               return updateKeywordsVolumeData(backgroundVolumes.volumes);
            })
            .catch((backgroundError) => {
               logger.error('Background keyword volume update failed', backgroundError instanceof Error ? backgroundError : new Error(String(backgroundError)));
            });
         return res.status(202).json({ started: true, keywordCount: keywordsToSend.length, countries: countryCount });
      }

      const keywordsVolumeData = await getKeywordsVolume(keywordsToSend);
      if (keywordsVolumeData.error) {
         return res.status(400).json(errorResponse('BAD_REQUEST', keywordsVolumeData.error, requestId));
      }

      if (keywordsVolumeData.volumes === false) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'Error Fetching Keywords Volume Data from Google Ads', requestId));
      }

      const volumesMap = keywordsVolumeData.volumes as Record<number, number>;

      const enrichedKeywords = keywordsToSend.map((keywordItem) => ({
         ...keywordItem,
         volume: volumesMap[keywordItem.ID] ?? keywordItem.volume ?? 0,
      }));

      if (!update) {
         return res.status(200).json({ keywords: enrichedKeywords, volumes: volumesMap });
      }

      const updated = await updateKeywordsVolumeData(volumesMap);
      if (updated) {
         return res.status(200).json({ keywords: enrichedKeywords, volumes: keywordsVolumeData.volumes });
      }

      // The lookup worked but saving the volumes failed: a server-side failure, not a bad request
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error saving keywords volume data', requestId));
   } catch (error) {
      logger.error('Error updating keywords volume data', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Updating Keywords Volume data', requestId));
   }
};
