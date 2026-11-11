import { Op } from 'sequelize';
import Keyword from '../../../../database/models/keyword';
import { logger } from '../../../../utils/logger';
import parseKeywords from '../../../../utils/parseKeywords';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../../../utils/adwords';
import { createRoute, fail, json, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { takeRateLimitToken } from '../../../../utils/rateLimit';
import { getClientIp } from '../../../../utils/api/clientIp';

// Looking up a whole domain (or every domain) is a paid Google Ads request per country, so it is limited per client.
// Lookups by keyword IDs are not limited here.
const DOMAIN_LOOKUPS_PER_HOUR = 6;
const ALL_DOMAIN_LOOKUPS_PER_HOUR = 2;


const updatekeywordVolume = async (req: Request, ctx: ApiContext) => {
   const body = await readJson(req);
   if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object.', ctx);
   }
   const { keywords = [], domain: rawDomain = '', update = true } = (body || {}) as Record<string, any>;
   const domain = typeof rawDomain === 'string' ? rawDomain.trim().toLowerCase() : rawDomain;
   if (!Array.isArray(keywords) || !keywords.every((id) => Number.isInteger(id) && id > 0)) {
      return fail(400, 'BAD_REQUEST', 'keywords must be a list of keyword IDs.', ctx);
   }
   if (typeof domain !== 'string') {
      return fail(400, 'BAD_REQUEST', 'domain must be a string.', ctx);
   }
   if (keywords.length === 0 && !domain) {
      return fail(400, 'BAD_REQUEST', 'Please provide keyword Ids or a domain name.', ctx);
   }

   if (domain && keywords.length === 0) {
      const clientKey = getClientIp(req);
      const allowed = takeRateLimitToken(`volume-domain:${clientKey}`, DOMAIN_LOOKUPS_PER_HOUR, 60 * 60 * 1000)
         && (domain !== 'all' || takeRateLimitToken(`volume-all:${clientKey}`, ALL_DOMAIN_LOOKUPS_PER_HOUR, 60 * 60 * 1000));
      if (!allowed) {
         return fail(429, 'TOO_MANY_REQUESTS', 'Too many domain volume lookups. Please try again later.', ctx);
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
         return fail(400, 'BAD_REQUEST', 'Error Updating Keywords Volume data', ctx);
      }

      const keywordsVolumeData = await getKeywordsVolume(keywordsToSend);
      if (keywordsVolumeData.error) {
         return fail(400, 'BAD_REQUEST', keywordsVolumeData.error, ctx);
      }

      if (keywordsVolumeData.volumes === false) {
         return fail(400, 'BAD_REQUEST', 'Error Fetching Keywords Volume Data from Google Ads', ctx);
      }

      const volumesMap = keywordsVolumeData.volumes as Record<number, number>;
      // Present only when some countries failed but others loaded, so the caller can tell it was a partial result.
      const failedCountriesField = keywordsVolumeData.failedCountries?.length ? { failedCountries: keywordsVolumeData.failedCountries } : {};

      const enrichedKeywords = keywordsToSend.map((keywordItem) => ({
         ...keywordItem,
         volume: volumesMap[keywordItem.ID] ?? keywordItem.volume ?? 0,
      }));

      if (!update) {
         return json({ keywords: enrichedKeywords, volumes: volumesMap, ...failedCountriesField });
      }

      const volumes = await updateKeywordsVolumeData(volumesMap, keywordsToSend);
      const current = await Keyword.findAll({ where: { ID: { [Op.in]: keywordsToSend.map((keyword) => keyword.ID) } } });
      return json({ keywords: parseKeywords(current.map((row) => row.get({ plain: true }))), volumes, ...failedCountriesField });
   } catch (error) {
      logger.error('Error updating keywords volume data', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Updating Keywords Volume data', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'volume', POST: updatekeywordVolume });
