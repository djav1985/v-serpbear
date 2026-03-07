/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import Keyword from '../../database/models/keyword';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { integrateKeywordSCData, readLocalSCData } from '../../utils/searchConsole';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';
import { formatLocation, hasValidCityStatePair, parseLocation } from '../../utils/location';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { toDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }

   if (req.method === 'GET') {
      return getKeywords(req, res);
   }
   if (req.method === 'POST') {
      return addKeywords(req, res);
   }
   if (req.method === 'DELETE') {
      return deleteKeywords(req, res);
   }
   if (req.method === 'PUT') {
      return updateKeywords(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

export default withApiLogging(handler, {
   name: 'keywords',
});

const getKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Required!', requestId));
   }
   const domain = (req.query.domain as string);

   try {
      const settings = await getAppSettings();
      const integratedSC = process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL;
      const { search_console_client_email, search_console_private_key } = settings;
      const domainSCData = integratedSC || (search_console_client_email && search_console_private_key)
         ? await readLocalSCData(domain)
         : false;

      const allKeywords:Keyword[] = await Keyword.findAll({ where: { domain } });
      const keywords: KeywordType[] = parseKeywords(allKeywords.map((e) => e.get({ plain: true })));
      
      // Consolidate pipeline: do history slicing + lastResult reset + SC integration in a single pass.
      // Collect legacy rows that need a history7d backfill; the writes happen after the response is sent.
      const backfillQueue: Array<{ id: number; history7d: string }> = [];

      const processedKeywords = keywords.map((keyword) => {
         let lastWeekHistory: KeywordHistory;

         if (keyword.history7d && Object.keys(keyword.history7d).length > 0) {
            // Use pre-computed 7-day history (populated at write time) to skip per-request sort
            lastWeekHistory = keyword.history7d;
         } else {
            // Fall back: compute from full history using timestamp-based sort (safe for YYYY-M-D keys)
            const historyEntries = Object.entries(keyword.history);
            if (historyEntries.length <= 7) {
               lastWeekHistory = keyword.history;
            } else {
               lastWeekHistory = {};
               const sortedEntries = historyEntries
                  .map(([dateKey, position]) => ({ dateKey, date: new Date(dateKey).getTime(), position }))
                  .sort((a, b) => a.date - b.date)
                  .slice(-7);
               sortedEntries.forEach(({ dateKey, position }) => {
                  lastWeekHistory[dateKey] = position;
               });
            }
            // Queue the backfill — do not write here to avoid per-row DB work on the request path
            if (historyEntries.length > 0) {
               backfillQueue.push({ id: keyword.ID, history7d: JSON.stringify(lastWeekHistory) });
            }
         }
         
         // Create keyword with slim history and reset lastResult
         const keywordWithSlimHistory = { ...keyword, lastResult: [], history: lastWeekHistory };
         
         // Integrate SC data if available
         const finalKeyword = domainSCData ? integrateKeywordSCData(keywordWithSlimHistory, domainSCData) : keywordWithSlimHistory;
         return finalKeyword;
      });
      
      // Send the response first, then drain the backfill queue off the request path
      res.status(200).json({ keywords: processedKeywords });

      if (backfillQueue.length > 0) {
         setImmediate(() => {
            backfillQueue.reduce<Promise<void>>(
               (chain, { id, history7d }) => chain.then(() =>
                  Keyword.update({ history7d }, { where: { ID: id } }).then(() => undefined)
               ).catch((err: unknown) => {
                  logger.error('Failed to backfill history7d', err instanceof Error ? err : new Error(String(err)), { keywordId: id });
               }),
               Promise.resolve(),
            );
         });
      }

      return;
   } catch (error) {
      logger.error(`Error getting domain keywords for: ${domain}`, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to load keywords for this domain.', requestId, message));
   }
};

/**
 * Validates and sanitizes keyword input data
 */
const validateKeywordData = (kwrd: any): { isValid: boolean, sanitized?: any, errors?: string[] } => {
   const errors: string[] = [];
   
   // Required fields validation
   if (!kwrd.keyword || typeof kwrd.keyword !== 'string') {
      errors.push('Keyword is required and must be a string');
   }
   if (!kwrd.domain || typeof kwrd.domain !== 'string') {
      errors.push('Domain is required and must be a string');
   }
   
   // Sanitize and validate keyword
   const keyword = typeof kwrd.keyword === 'string' ? kwrd.keyword.trim().substring(0, 200) : '';
   if (keyword.length === 0) {
      errors.push('Keyword cannot be empty');
   }
   
   // Validate domain format (basic validation)
   const domain = typeof kwrd.domain === 'string' ? kwrd.domain.trim().toLowerCase().substring(0, 100) : '';
   const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;
   if (domain.length === 0 || !domainRegex.test(domain)) {
      errors.push('Invalid domain format');
   }
   
   // Validate device
   const validDevices = ['desktop', 'mobile'];
   const device = validDevices.includes(kwrd.device) ? kwrd.device : 'desktop';
   
   // Validate country code (basic validation)
   const country = typeof kwrd.country === 'string' && /^[A-Z]{2}$/.test(kwrd.country) ? kwrd.country : 'US';
   
   // Sanitize optional fields
   const rawLocation = typeof kwrd.location === 'string' ? kwrd.location.trim().substring(0, 255) : '';
   const city = typeof kwrd.city === 'string' ? kwrd.city.trim().substring(0, 100) : '';
   const state = typeof kwrd.state === 'string' ? kwrd.state.trim().substring(0, 100) : '';
   const tags = typeof kwrd.tags === 'string' ? kwrd.tags.trim().substring(0, 500) : '';

   if (!hasValidCityStatePair(city, state)) {
      errors.push('City and state must be provided together when provided');
   }

   const parsedLocation = parseLocation(rawLocation, country);
   const location = formatLocation({
      city: city || parsedLocation.city,
      state: state || parsedLocation.state,
      country: parsedLocation.country || country,
   }).substring(0, 255);
   
   if (errors.length > 0) {
      return { isValid: false, errors };
   }
   
   return {
      isValid: true,
      sanitized: {
         keyword,
         domain,
         device,
         country,
         location,
         tags
      }
   };
};

const addKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const { keywords } = req.body;
   
   // Enhanced input validation
   if (!keywords) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Keywords array is required', requestId, 'Request body must contain a keywords array'));
   }
   
   if (!Array.isArray(keywords)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Keywords must be an array', requestId, 'The keywords field must be an array of keyword objects'));
   }
   
   if (keywords.length === 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'At least one keyword is required', requestId, 'Keywords array cannot be empty'));
   }
   
   if (keywords.length > 100) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Too many keywords', requestId, 'Maximum 100 keywords can be added at once'));
   }

   const keywordsToAdd: Array<{
      keyword: string;
      device: string;
      domain: string;
      country: string;
      location: string;
      position: number;
      updating: boolean;
      history: string;
      lastResult: string;
      url: string;
      tags: string;
      sticky: boolean;
      lastUpdated: string;
      added: string;
      mapPackTop3: boolean;
   }> = [];
   const validationErrors: string[] = [];

   const now = new Date().toJSON();
   keywords.forEach((kwrd: KeywordAddPayload, index: number) => {
      const validation = validateKeywordData(kwrd);
      
      if (!validation.isValid) {
         validationErrors.push(`Keyword ${index + 1}: ${validation.errors?.join(', ')}`);
         return;
      }
      
      const { keyword, domain, device, country, location, tags } = validation.sanitized!;
      const tagsArray = tags ? tags.split(',').map((item:string) => item.trim()).filter((tag: string) => tag.length > 0) : [];
      const dedupedTags: string[] = [];
      const seenTags = new Set<string>();
      tagsArray.forEach((tag: string) => {
         const normalized = tag.toLowerCase();
         if (!seenTags.has(normalized)) {
            seenTags.add(normalized);
            dedupedTags.push(tag);
         }
      });

      const newKeyword = {
         keyword,
         device,
         domain,
         country,
         location,
         position: 0,
         updating: toDbBool(true),
         updatingStartedAt: now,
         history: JSON.stringify({}),
         lastResult: JSON.stringify([]),
         url: '',
         tags: JSON.stringify(dedupedTags.slice(0, 10)), // Limit to 10 tags
         sticky: toDbBool(false),
         lastUpdated: now,
         added: now,
         mapPackTop3: toDbBool(false),
      } as any;
      keywordsToAdd.push(newKeyword);
   });
   
   if (validationErrors.length > 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Validation failed', requestId, validationErrors.join('; ')));
   }
   
   if (keywordsToAdd.length === 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keywords to add', requestId, 'All provided keywords failed validation'));
   }

   try {
      await Keyword.bulkCreate(keywordsToAdd as any);
      
      // Reload keywords from DB to ensure IDs are populated
      // Use added timestamp to find only the just-created keywords (not existing ones)
      const reloadedKeywords = await Keyword.findAll({
         where: { 
            added: now,
         },
      });
      
      const formattedkeywords = reloadedKeywords.map((el) => el.get({ plain: true }));
      const keywordsParsed: KeywordType[] = parseKeywords(formattedkeywords);

      // Queue the SERP Scraping Process through refreshQueue to manage concurrency
      const settings = await getAppSettings();
      const domainName = keywordsParsed[0]?.domain;
      if (domainName) {
         // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
         const uniqueId = crypto.randomUUID();
         await refreshQueue.enqueue(
            `addKeywords-${domainName}-${uniqueId}`,
            async () => {
               try {
                  await refreshAndUpdateKeywords(reloadedKeywords, settings);
               } catch (error) {
                  logger.error('Failed to refresh keywords after adding', error instanceof Error ? error : new Error(String(error)));
               }
            },
            domainName
         );
      } else {
         // Fallback: if no domain, just call it directly
         refreshAndUpdateKeywords(reloadedKeywords, settings).catch((error) => {
            logger.error('Failed to refresh keywords after adding', error instanceof Error ? error : new Error(String(error)));
         });
      }

      // Update the Keyword Volume
      const { adwords_account_id, adwords_client_id, adwords_client_secret, adwords_developer_token } = settings;
      if (adwords_account_id && adwords_client_id && adwords_client_secret && adwords_developer_token) {
         const keywordsVolumeData = await getKeywordsVolume(keywordsParsed);
         if (keywordsVolumeData.volumes !== false) {
            await updateKeywordsVolumeData(keywordsVolumeData.volumes);
         }
      }

      return res.status(201).json({ keywords: keywordsParsed });
   } catch (error) {
      logger.error('Adding New Keywords ', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to add keywords.', requestId, message));
   }
};

const deleteKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   logger.debug('req.query.id: ', { data: req.query.id });

   try {
      const keywordsToRemove = (req.query.id as string).split(',').map((item) => {
         const id = parseInt(item, 10);
         return isNaN(id) ? 0 : id;
      }).filter(id => id > 0);
      
      if (keywordsToRemove.length === 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keyword IDs provided', requestId));
      }
      
      // Check which domains these keywords belong to
      const keywordsToCheck = await Keyword.findAll({ 
         where: { ID: { [Op.in]: keywordsToRemove } },
         attributes: ['ID', 'domain'],
      });
      
      const affectedDomains = Array.from(new Set(keywordsToCheck.map(k => k.domain)));
      const lockedDomains = affectedDomains.filter(domain => refreshQueue.isDomainLocked(domain));
      
      if (lockedDomains.length > 0) {
         logger.warn(`Cannot delete keywords while domains are being refreshed`, { lockedDomains });
         return res.status(409).json(
            errorResponse('CONFLICT', `Cannot delete keywords while their domains are being refreshed: ${lockedDomains.join(', ')}. Please wait for the refresh to complete.`, requestId),
         );
      }
      
      const removeQuery = { where: { ID: { [Op.in]: keywordsToRemove } } };
      const removedKeywordCount: number = await Keyword.destroy(removeQuery);
      return res.status(200).json({ keywordsRemoved: removedKeywordCount });
   } catch (error) {
      logger.error('Removing Keyword. ', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to remove keywords.', requestId, message));
   }
};

const updateKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   if (req.body.sticky === undefined && req.body.tags === undefined) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Keyword update payload is required.', requestId));
   }
   const keywordIDs = (req.query.id as string).split(',').map((item) => parseInt(item, 10));
   const { sticky, tags } = req.body;

   try {
      let keywords: KeywordType[] = [];
      if (sticky !== undefined) {
         await Keyword.update({ sticky: toDbBool(sticky) }, { where: { ID: { [Op.in]: keywordIDs } } });
         const updateQuery = { where: { ID: { [Op.in]: keywordIDs } } };
         const updatedKeywords:Keyword[] = await Keyword.findAll(updateQuery);
         const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
         keywords = parseKeywords(formattedKeywords);
         return res.status(200).json({ keywords });
      }
      if (tags !== undefined) {
         if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid Payload!', requestId));
         }

         const tagsKeywordIDs = Object.keys(tags);
         if (tagsKeywordIDs.length === 0) {
            return res.status(200).json({ keywords: [] });
         }

         const updatedKeywordIDs = new Set<number>();

         for (const keywordID of tagsKeywordIDs) {
            const numericId = Number(keywordID);
            if (!Number.isFinite(numericId)) {
               continue;
            }

            const tagsForKeywordRaw = tags[keywordID];
            const tagsForKeyword = Array.isArray(tagsForKeywordRaw)
               ? tagsForKeywordRaw
               : [];
            const sanitizedTags = Array.from(new Set(
               tagsForKeyword
                  .filter((tag): tag is string => typeof tag === 'string')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0),
            )).sort();

            const selectedKeyword = await Keyword.findOne({ where: { ID: numericId } });

            if (selectedKeyword) {
               await selectedKeyword.update({ tags: JSON.stringify(sanitizedTags) });
               updatedKeywordIDs.add(numericId);
            }
         }

         if (updatedKeywordIDs.size > 0) {
            const updatedKeywords:Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: Array.from(updatedKeywordIDs) } } });
            const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
            keywords = parseKeywords(formattedKeywords);
         }

         return res.status(200).json({ keywords });
      }
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid Payload!', requestId));
   } catch (error) {
      logger.error('Updating Keyword. ', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update keywords.', requestId, message));
   }
};
