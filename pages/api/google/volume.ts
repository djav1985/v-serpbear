/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import Keyword from '../../../database/models/keyword';
import { logger } from '../../../utils/logger';
import verifyUser from '../../../utils/verifyUser';
import parseKeywords from '../../../utils/parseKeywords';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../../utils/adwords';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';
import { takeRateLimitToken } from '../../../utils/rateLimit';
import { getClientIp } from '../../../utils/api/clientIp';

// Looking up a whole domain (or every domain) is a paid Google Ads request per country, so it is limited per client.
// Lookups by keyword IDs are not limited here.
const DOMAIN_LOOKUPS_PER_HOUR = 6;
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

   if (domain && keywords.length === 0) {
      const clientKey = getClientIp(req);
      const allowed = takeRateLimitToken(`volume-domain:${clientKey}`, DOMAIN_LOOKUPS_PER_HOUR, 60 * 60 * 1000)
         && (domain !== 'all' || takeRateLimitToken(`volume-all:${clientKey}`, ALL_DOMAIN_LOOKUPS_PER_HOUR, 60 * 60 * 1000));
      if (!allowed) {
         return res.status(429).json(errorResponse('TOO_MANY_REQUESTS', 'Too many domain volume lookups. Please try again later.', requestId));
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
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Updating Keywords Volume data', requestId));
   } catch (error) {
      logger.error('Error updating keywords volume data', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Error Updating Keywords Volume data', requestId));
   }
};
