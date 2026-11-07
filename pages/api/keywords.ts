/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import crypto from 'crypto';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import { loadDomainKeywords } from '../../utils/keywordsList';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';
import { buildStoredLocation, getLocationCountry, hasValidCityStatePair, isCountryOnlyLocation, parseCityState } from '../../utils/location';
import { planLocationUpdate } from '../../utils/keywordMeta';
import { isValidHostname } from '../../utils/validators/hostname';
import { logger } from '../../utils/logger';
import { withApiLogging } from '../../utils/apiLogging';
import { toDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';
import { errorResponse } from '../../utils/api/response';
import { retryQueueManager } from '../../utils/retryQueueManager';
import { updateDomainStats } from '../../utils/updateDomainStats';

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

// Most tags one keyword can carry. POST trims a longer list to this many; PUT rejects it.
const MAX_TAGS_PER_KEYWORD = 10;

/** Trims, drops blanks and duplicates, and sorts the tags an update sends for one keyword. Non-list input gives no tags. */
const sanitizeTagList = (raw: unknown): string[] => Array.from(new Set(
   (Array.isArray(raw) ? raw : [])
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
)).sort();

/** The JSON body as an object; null, arrays and other types read as an empty object. */
const readBody = (req: NextApiRequest): Record<string, any> => (
   req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
);

/** True when a bulk request names keywords, in the JSON body `ids` array or the legacy comma-separated `id` query. */
const hasKeywordIdInput = (req: NextApiRequest): boolean => (
   readBody(req).ids !== undefined || (typeof req.query.id === 'string' && req.query.id.length > 0)
);

/**
 * Keyword IDs for a bulk request. The body `ids` array wins; it returns null when any item is not a positive
 * integer. The legacy `id` query is strict too: any item that is not a plain positive integer (such as "12abc") gives null.
 */
const readKeywordIds = (req: NextApiRequest): number[] | null => {
   const body = readBody(req);
   if (body.ids !== undefined) {
      const ids: unknown = body.ids;
      const valid = Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0);
      return valid ? Array.from(new Set(ids as number[])) : null;
   }
   const raw = typeof req.query.id === 'string' ? req.query.id : '';
   const items = raw.split(',').map((item) => item.trim());
   if (items.some((item) => !/^\d+$/.test(item))) { return null; }
   const ids = Array.from(new Set(items.map((item) => Number(item))));
   return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? ids : null;
};

/**
 * Recalculates the stored stats (keywordsTracked, avgPosition, mapPackKeywords) for each domain once.
 * A failure is logged and never fails the request that already changed the keywords.
 */
const refreshDomainStats = async (domainNames: string[]): Promise<void> => {
   for (const domainName of Array.from(new Set(domainNames))) {
      try {
         await updateDomainStats(domainName);
      } catch (error) {
         logger.error(`Failed to update domain stats for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
      }
   }
};

const getKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Domain is Required!', requestId));
   }
   const domain = (req.query.domain as string);

   try {
      const { keywords: processedKeywords, backfill } = await loadDomainKeywords(domain);

      // Send the response first, then drain the backfill queue off the request path
      res.status(200).json({ keywords: processedKeywords });
      setImmediate(backfill);

      return;
   } catch (error) {
      logger.error(`Error getting domain keywords for: ${domain}`, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to load keywords for this domain.', requestId));
   }
};

/**
 * Validates and sanitizes keyword input data
 */
const validateKeywordData = (kwrd: any): { isValid: boolean, sanitized?: any, errors?: string[] } => {
   if (!kwrd || typeof kwrd !== 'object' || Array.isArray(kwrd)) {
      return { isValid: false, errors: ['Keyword must be an object'] };
   }
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
   
   // Same hostname rules as adding a domain (utils/validators/hostname)
   const domain = typeof kwrd.domain === 'string' ? kwrd.domain.trim().toLowerCase().substring(0, 100) : '';
   if (!isValidHostname(domain)) {
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

   // The location's country is the market the scraper searches, so it wins over the request's country
   const marketCountry = getLocationCountry(rawLocation) || country;
   // A country-only location names no city or state; anything else must give both
   const parsedLocation = isCountryOnlyLocation(rawLocation) ? { city: '', state: '' } : parseCityState(rawLocation);
   const cityValue = city || parsedLocation.city;
   const stateValue = state || parsedLocation.state;
   if (!hasValidCityStatePair(cityValue, stateValue)) {
      errors.push('City and state must be provided together.');
   }
   // Stored as "City,State,Country Name"; a country-only keyword stores a blank location
   const location = buildStoredLocation({
      city: cityValue,
      state: stateValue,
      countryCode: marketCountry,
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
         country: marketCountry,
         location,
         tags
      }
   };
};

const addKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const { keywords } = readBody(req);
   
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
         tags: JSON.stringify(dedupedTags.slice(0, MAX_TAGS_PER_KEYWORD)),
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
      // Keywords can only be added to a domain that is already tracked
      const requestedDomains = Array.from(new Set(keywordsToAdd.map((keyword) => keyword.domain)));
      const knownDomains: Domain[] = await Domain.findAll({ where: { domain: requestedDomains }, attributes: ['domain'] });
      const knownDomainNames = new Set(knownDomains.map((domain) => domain.get({ plain: true }).domain));
      const unknownDomains = requestedDomains.filter((domain) => !knownDomainNames.has(domain));
      if (unknownDomains.length > 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', `Domains not found in database: ${unknownDomains.join(', ')}. Please ensure domains are created before adding keywords.`, requestId));
      }

      // The same keyword, country, location and device on the same domain is one tracked keyword. The same
      // keyword in a different city is a separate target (the Add Keywords form lets users pick one), so the
      // location is part of the key. A missing location and an empty one count as the same (no city).
      const trackingKey = (item: { keyword: string, domain: string, device: string, country: string, location?: string | null }) => (
         [item.domain, item.keyword, item.country, (item.location || '').trim(), item.device].join('|')
      );
      const existingKeywords: Keyword[] = await Keyword.findAll({ where: { domain: requestedDomains }, attributes: ['keyword', 'domain', 'device', 'country', 'location'] });
      const tracked = new Set(existingKeywords.map((item) => trackingKey(item.get({ plain: true }) as KeywordType)));
      const duplicates: string[] = [];
      keywordsToAdd.forEach((item) => {
         const key = trackingKey(item);
         if (tracked.has(key)) {
            duplicates.push(`${item.keyword} (${item.device})`);
         }
         tracked.add(key);
      });
      if (duplicates.length > 0) {
         return res.status(409).json(errorResponse('CONFLICT', `Already tracked: ${duplicates.join(', ')}`, requestId));
      }

      const createdKeywords = await Keyword.bulkCreate(keywordsToAdd as any);
      await refreshDomainStats(requestedDomains);

      // Reload exactly the rows this request inserted, by the IDs the insert returned. The "added" timestamp alone
      // could also match rows from another request created in the same millisecond. The fallback keeps the old query
      // for the case where the driver does not return IDs.
      const createdIds = (createdKeywords || []).map((keyword: Keyword) => keyword.ID).filter((id: unknown): id is number => Number.isInteger(id));
      const reloadedKeywords = createdIds.length === keywordsToAdd.length
         ? await Keyword.findAll({ where: { ID: { [Op.in]: createdIds } } })
         : await Keyword.findAll({ where: { added: now } });
      
      const formattedkeywords = reloadedKeywords.map((el) => el.get({ plain: true }));
      const keywordsParsed: KeywordType[] = parseKeywords(formattedkeywords);

      // Queue the SERP Scraping Process through refreshQueue to manage concurrency
      const settings = await getAppSettings();
      const domainName = keywordsParsed[0]?.domain;
      const taskDomains = Array.from(new Set(keywordsParsed.map((keyword) => keyword.domain?.trim().toLowerCase()).filter(Boolean)));
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
            taskDomains
         );
      } else {
         // Fallback: if no domain, just call it directly
         refreshAndUpdateKeywords(reloadedKeywords, settings).catch((error) => {
            logger.error('Failed to refresh keywords after adding', error instanceof Error ? error : new Error(String(error)));
         });
      }

      // Update the Keyword Volume in the background. The AdWords lookup can take several seconds per country,
      // and a failure here must not turn an already-created keyword into a 500 that tempts a retry.
      const { adwords_account_id, adwords_client_id, adwords_client_secret, adwords_developer_token } = settings;
      if (adwords_account_id && adwords_client_id && adwords_client_secret && adwords_developer_token) {
         getKeywordsVolume(keywordsParsed)
            .then((keywordsVolumeData) => (
               keywordsVolumeData.volumes !== false ? updateKeywordsVolumeData(keywordsVolumeData.volumes) : undefined
            ))
            .catch((volumeError) => {
               logger.error('Failed to update keyword volume after adding keywords', volumeError instanceof Error ? volumeError : new Error(String(volumeError)));
            });
      }

      return res.status(201).json({ keywords: keywordsParsed });
   } catch (error) {
      // Two overlapping requests can both pass the duplicate check; the unique index then rejects the second insert
      if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
         return res.status(409).json(errorResponse('CONFLICT', 'Already tracked: one or more of these keywords was added by another request.', requestId));
      }
      logger.error('Adding New Keywords ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to add keywords.', requestId));
   }
};

const deleteKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!hasKeywordIdInput(req)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   logger.debug('keyword IDs: ', { data: req.body?.ids ?? req.query.id });

   try {
      const keywordsToRemove = readKeywordIds(req) ?? [];

      if (keywordsToRemove.length === 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keyword IDs provided', requestId));
      }
      
      // Check which domains these keywords belong to
      const keywordsToCheck = await Keyword.findAll({ 
         where: { ID: { [Op.in]: keywordsToRemove } },
         attributes: ['ID', 'domain'],
      });
      
      const affectedDomains = Array.from(new Set(keywordsToCheck.map(k => k.domain)));
      // Claim the domains for the duration of the delete, so a refresh that starts after the check cannot begin
      // while the rows are being removed. A null claim means a domain is locked.
      const releaseDomains = refreshQueue.reserveDomains(affectedDomains);
      if (!releaseDomains) {
         const lockedDomains = affectedDomains.filter(domain => refreshQueue.isDomainLocked(domain));
         logger.warn(`Cannot delete keywords while domains are being refreshed`, { lockedDomains });
         return res.status(409).json(
            errorResponse('CONFLICT', `Cannot delete keywords while their domains are being refreshed: ${lockedDomains.join(', ')}. Please wait for the refresh to complete.`, requestId),
         );
      }

      try {
         const removeQuery = { where: { ID: { [Op.in]: keywordsToRemove } } };
         const removedKeywordCount: number = await Keyword.destroy(removeQuery);
         await refreshDomainStats(affectedDomains);
         await retryQueueManager.removeBatch(new Set(keywordsToRemove));
         return res.status(200).json({ keywordsRemoved: removedKeywordCount });
      } finally {
         releaseDomains();
      }
   } catch (error) {
      logger.error('Removing Keyword. ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to remove keywords.', requestId));
   }
};

const updateKeywords = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!hasKeywordIdInput(req)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'keyword ID is Required!', requestId));
   }
   const body = readBody(req);
   if (body.sticky === undefined && body.tags === undefined && body.location === undefined) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Keyword update payload is required.', requestId));
   }
   // Anything that is not a positive ID is rejected or dropped, so NaN and 0 never reach the database query
   const keywordIDs = readKeywordIds(req) ?? [];
   if (keywordIDs.length === 0) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'No valid keyword IDs provided', requestId));
   }
   const { sticky, tags, location } = body;

   try {
      let keywords: KeywordType[] = [];
      if (sticky !== undefined) {
         if (typeof sticky !== 'boolean') {
            return res.status(400).json(errorResponse('BAD_REQUEST', 'sticky must be true or false.', requestId));
         }
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
         // Keys must be plain positive integers ("1.0" or "01" would select a keyword but never match its tag list)
         if (tagsKeywordIDs.some((keywordID) => !/^[1-9]\d*$/.test(keywordID) || !Number.isSafeInteger(Number(keywordID)))) {
            return res.status(400).json(errorResponse('BAD_REQUEST', 'Tag keys must be keyword IDs (positive whole numbers).', requestId));
         }
         // Checked for the whole payload before any keyword is changed
         if (Object.values(tags).some((list) => sanitizeTagList(list).length > MAX_TAGS_PER_KEYWORD)) {
            return res.status(400).json(errorResponse('BAD_REQUEST', `A keyword can have at most ${MAX_TAGS_PER_KEYWORD} tags.`, requestId));
         }

         const numericIds = tagsKeywordIDs.map((keywordID) => Number(keywordID)).filter((id) => Number.isFinite(id));
         // One query for all keywords, instead of a lookup per keyword
         const existingKeywords: Keyword[] = numericIds.length > 0
            ? await Keyword.findAll({ where: { ID: { [Op.in]: numericIds } } })
            : [];

         const updatedKeywordIDs = new Set<number>();

         for (const selectedKeyword of existingKeywords) {
            const keywordID = selectedKeyword.ID;
            const sanitizedTags = sanitizeTagList(tags[String(keywordID)]);

            await selectedKeyword.update({ tags: JSON.stringify(sanitizedTags) });
            updatedKeywordIDs.add(keywordID);
         }

         if (updatedKeywordIDs.size > 0) {
            const updatedKeywords:Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: Array.from(updatedKeywordIDs) } } });
            const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
            keywords = parseKeywords(formattedKeywords);
         }

         return res.status(200).json({ keywords });
      }
      if (location !== undefined) {
         const rawLocation = typeof location === 'string' ? location.trim().substring(0, 255) : '';
         const requestedCountry = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : '';
         const locationCountry = requestedCountry || getLocationCountry(rawLocation);
         if (!locationCountry) {
            return res.status(400).json(errorResponse('BAD_REQUEST', 'Country is required!', requestId));
         }
         // A country-only location names no city or state; anything else must give both, or the update would drop them
         const countryOnly = isCountryOnlyLocation(rawLocation);
         const parsedLocation = countryOnly ? { city: '', state: '' } : parseCityState(rawLocation);
         if (!hasValidCityStatePair(parsedLocation.city, parsedLocation.state)) {
            return res.status(400).json(errorResponse('BAD_REQUEST', 'City and state must be provided together.', requestId));
         }
         // City-level locations store "City,State,Country Name"; country-only locations store a blank location
         const formattedLocation = buildStoredLocation({
            city: parsedLocation.city,
            state: parsedLocation.state,
            countryCode: locationCountry,
         }).substring(0, 255);
         const locationUpdate = { location: formattedLocation, country: locationCountry };
         const selectedKeywords: Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: keywordIDs } } });
         const domains = [...new Set(selectedKeywords.map((el) => el.domain))];
         // Other tracked keywords on the same domains, so a change cannot create a duplicate
         const otherKeywords: Keyword[] = domains.length > 0
            ? await Keyword.findAll({ where: { domain: { [Op.in]: domains }, ID: { [Op.notIn]: keywordIDs } } })
            : [];
         const { acceptedIDs, skipped } = planLocationUpdate(
            selectedKeywords.map((el) => ({ ID: el.ID, keyword: el.keyword, domain: el.domain, country: el.country, device: el.device, location: el.location || '' })),
            otherKeywords.map((el) => ({ ID: el.ID, keyword: el.keyword, domain: el.domain, country: el.country, device: el.device, location: el.location || '' })),
            locationCountry,
            formattedLocation,
         );
         if (acceptedIDs.length > 0) {
            await Keyword.update(locationUpdate, { where: { ID: { [Op.in]: acceptedIDs } } });
         }
         const updatedKeywords:Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: keywordIDs } } });
         const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
         keywords = parseKeywords(formattedKeywords);
         return res.status(200).json({ keywords, updatedCount: acceptedIDs.length, skipped });
      }
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid Payload!', requestId));
   } catch (error) {
      logger.error('Updating Keyword. ', error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update keywords.', requestId));
   }
};
