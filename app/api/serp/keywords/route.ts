import { Transaction, Op } from 'sequelize';
import crypto from 'crypto';
import Keyword from '../../../../database/models/keyword';
import Domain from '../../../../database/models/domain';
import { getAppSettings } from '../../../../utils/appSettings';
import { loadDomainKeywords } from '../../../../utils/keywordsList';
import parseKeywords from '../../../../utils/parseKeywords';
import { refreshKeywordsByIds, markKeywordsAsUpdating, clearKeywordUpdatingFlags } from '../../../../utils/refresh';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../../../utils/adwords';
import { buildStoredLocation, getLocationCountry, hasValidCityStatePair, isCountryOnlyLocation, parseCityState } from '../../../../utils/location';
import { planLocationUpdate } from '../../../../utils/keywordMeta';
import { isValidHostname } from '../../../../utils/validators/hostname';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, getParam, readJson, type ApiContext } from '../../../../utils/apiLogging';
import db from '../../../../database/database';
import { toDbBool } from '../../../../utils/dbBooleans';
import { refreshQueue } from '../../../../utils/refreshQueue';
import { retryQueueManager } from '../../../../utils/retryQueueManager';
import { updateDomainStats } from '../../../../utils/updateDomainStats';


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
const readBody = async (req: Request): Promise<Record<string, any>> => {
   const body = await readJson(req);
   return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, any> : {};
};

/** True when a bulk request names keyword IDs in its JSON body. */
const hasKeywordIdInput = async (req: Request): Promise<boolean> => (await readBody(req)).ids !== undefined;

/**
 * Keyword IDs for a bulk request. It returns null when any item is not a positive integer.
 */
const readKeywordIds = async (req: Request): Promise<number[] | null> => {
   const body = await readBody(req);
   const ids: unknown = body.ids;
   const valid = Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0);
   return valid ? Array.from(new Set(ids as number[])) : null;
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

const getKeywords = async (req: Request, ctx: ApiContext) => {
   if (!getParam(req, 'domain')) {
      return fail(400, 'BAD_REQUEST', 'Domain is Required!', ctx);
   }
   const domain = getParam(req, 'domain') as string;

   try {
      const { keywords: processedKeywords, backfill } = await loadDomainKeywords(domain);

      // Drain the backfill queue after this response has been handed back, off the request path
      setImmediate(backfill);
      return json({ keywords: processedKeywords });
   } catch (error) {
      logger.error(`Error getting domain keywords for: ${domain}`, error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to load keywords for this domain.', ctx);
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

const addKeywords = async (req: Request, ctx: ApiContext) => {
   const { keywords } = await readBody(req);
   
   // Enhanced input validation
   if (!keywords) {
      return fail(400, 'BAD_REQUEST', 'Keywords array is required', ctx, 'Request body must contain a keywords array');
   }
   
   if (!Array.isArray(keywords)) {
      return fail(400, 'BAD_REQUEST', 'Keywords must be an array', ctx, 'The keywords field must be an array of keyword objects');
   }
   
   if (keywords.length === 0) {
      return fail(400, 'BAD_REQUEST', 'At least one keyword is required', ctx, 'Keywords array cannot be empty');
   }
   
   if (keywords.length > 100) {
      return fail(400, 'BAD_REQUEST', 'Too many keywords', ctx, 'Maximum 100 keywords can be added at once');
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
      return fail(400, 'BAD_REQUEST', 'Validation failed', ctx, validationErrors.join('; '));
   }
   
   if (keywordsToAdd.length === 0) {
      return fail(400, 'BAD_REQUEST', 'No valid keywords to add', ctx, 'All provided keywords failed validation');
   }

   try {
      // Keywords can only be added to a domain that is already tracked
      const requestedDomains = Array.from(new Set(keywordsToAdd.map((keyword) => keyword.domain)));
      const createdKeywords = await db.transaction({ type: Transaction.TYPES.IMMEDIATE }, async (transaction) => {
         const knownDomains: Domain[] = await Domain.findAll({ where: { domain: requestedDomains }, attributes: ['domain'], transaction });
         const knownDomainNames = new Set(knownDomains.map((domain) => domain.get({ plain: true }).domain));
         const unknownDomains = requestedDomains.filter((domain) => !knownDomainNames.has(domain));
         if (unknownDomains.length > 0) {
            return fail(400, 'BAD_REQUEST', `Domains not found in database: ${unknownDomains.join(', ')}. Please ensure domains are created before adding keywords.`, ctx);
         }

         // The same keyword, country, location and device on the same domain is one tracked keyword. The same
         // keyword in a different city is a separate target (the Add Keywords form lets users pick one), so the
         // location is part of the key. A missing location and an empty one count as the same (no city).
         const trackingKey = (item: { keyword: string, domain: string, device: string, country: string, location?: string | null }) => (
            [item.domain, item.keyword, item.country, (item.location || '').trim(), item.device].join('|')
         );
         const existingKeywords: Keyword[] = await Keyword.findAll({ where: { domain: requestedDomains }, attributes: ['keyword', 'domain', 'device', 'country', 'location'], transaction });
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
            return fail(409, 'CONFLICT', `Already tracked: ${duplicates.join(', ')}`, ctx);
         }

         return Keyword.bulkCreate(keywordsToAdd as any, { transaction });
      });
      if (createdKeywords instanceof Response) { return createdKeywords; }
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
                  // Loaded when the task starts, so a row removed or moved while it waited is handled
                  await refreshKeywordsByIds(reloadedKeywords.map((keyword) => keyword.ID), settings);
               } catch (error) {
                  logger.error('Failed to refresh keywords after adding', error instanceof Error ? error : new Error(String(error)));
               }
            },
            taskDomains
         );
      } else {
         // Fallback: if no domain, just call it directly
         refreshKeywordsByIds(reloadedKeywords.map((keyword) => keyword.ID), settings).catch((error) => {
            logger.error('Failed to refresh keywords after adding', error instanceof Error ? error : new Error(String(error)));
         });
      }

      // Update the Keyword Volume in the background. The AdWords lookup can take several seconds per country,
      // and a failure here must not turn an already-created keyword into a 500 that tempts a retry.
      const { adwords_account_id, adwords_client_id, adwords_client_secret, adwords_developer_token } = settings;
      if (adwords_account_id && adwords_client_id && adwords_client_secret && adwords_developer_token) {
         getKeywordsVolume(keywordsParsed)
            .then((keywordsVolumeData) => (
               keywordsVolumeData.volumes !== false ? updateKeywordsVolumeData(keywordsVolumeData.volumes, keywordsParsed) : undefined
            ))
            .catch((volumeError) => {
               logger.error('Failed to update keyword volume after adding keywords', volumeError instanceof Error ? volumeError : new Error(String(volumeError)));
            });
      }

      return json({ keywords: keywordsParsed }, 201);
   } catch (error) {
      // Two overlapping requests can both pass the duplicate check; the unique index then rejects the second insert
      if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
         return fail(409, 'CONFLICT', 'Already tracked: one or more of these keywords was added by another request.', ctx);
      }
      logger.error('Adding New Keywords ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to add keywords.', ctx);
   }
};

const deleteKeywords = async (req: Request, ctx: ApiContext) => {
   if (!(await hasKeywordIdInput(req))) {
      return fail(400, 'BAD_REQUEST', 'keyword ID is Required!', ctx);
   }
   logger.debug('[SCRAPER] keyword IDs: ', { data: (await readBody(req)).ids });

   try {
      const keywordsToRemove = (await readKeywordIds(req)) ?? [];

      if (keywordsToRemove.length === 0) {
         return fail(400, 'BAD_REQUEST', 'No valid keyword IDs provided', ctx);
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
         logger.debug(`[SCRAPER] Cannot delete keywords while domains are being refreshed`, { lockedDomains });
         return fail(409, 'CONFLICT', `Cannot delete keywords while their domains are being refreshed: ${lockedDomains.join(', ')}. Try again once the refresh has finished.`, ctx);
      }

      try {
         const removeQuery = { where: { ID: { [Op.in]: keywordsToRemove } } };
         const removedKeywordCount: number = await Keyword.destroy(removeQuery);
         await refreshDomainStats(affectedDomains);
         await retryQueueManager.removeBatch(new Set(keywordsToRemove));
         return json({ keywordsRemoved: removedKeywordCount });
      } finally {
         releaseDomains();
      }
   } catch (error) {
      logger.error('Removing Keyword. ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to remove keywords.', ctx);
   }
};

const updateKeywords = async (req: Request, ctx: ApiContext) => {
   if (!(await hasKeywordIdInput(req))) {
      return fail(400, 'BAD_REQUEST', 'keyword ID is Required!', ctx);
   }
   const body = await readBody(req);
   if (body.sticky === undefined && body.tags === undefined && body.location === undefined) {
      return fail(400, 'BAD_REQUEST', 'Keyword update payload is required.', ctx);
   }
   // Anything that is not a positive ID is rejected or dropped, so NaN and 0 never reach the database query
   const keywordIDs = (await readKeywordIds(req)) ?? [];
   if (keywordIDs.length === 0) {
      return fail(400, 'BAD_REQUEST', 'No valid keyword IDs provided', ctx);
   }
   const { sticky, tags, location } = body;

   try {
      let keywords: KeywordType[] = [];
      if (sticky !== undefined) {
         if (typeof sticky !== 'boolean') {
            return fail(400, 'BAD_REQUEST', 'sticky must be true or false.', ctx);
         }
         await Keyword.update({ sticky: toDbBool(sticky) }, { where: { ID: { [Op.in]: keywordIDs } } });
         const updateQuery = { where: { ID: { [Op.in]: keywordIDs } } };
         const updatedKeywords:Keyword[] = await Keyword.findAll(updateQuery);
         const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
         keywords = parseKeywords(formattedKeywords);
         return json({ keywords });
      }
      if (tags !== undefined) {
         if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            return fail(400, 'BAD_REQUEST', 'Invalid Payload!', ctx);
         }

         const tagsKeywordIDs = Object.keys(tags);
         if (tagsKeywordIDs.length === 0) {
            return json({ keywords: [] });
         }
         // Keys must be plain positive integers ("1.0" or "01" would select a keyword but never match its tag list)
         if (tagsKeywordIDs.some((keywordID) => !/^[1-9]\d*$/.test(keywordID) || !Number.isSafeInteger(Number(keywordID)))) {
            return fail(400, 'BAD_REQUEST', 'Tag keys must be keyword IDs (positive whole numbers).', ctx);
         }
         // Checked for the whole payload before any keyword is changed
         if (Object.values(tags).some((list) => sanitizeTagList(list).length > MAX_TAGS_PER_KEYWORD)) {
            return fail(400, 'BAD_REQUEST', `A keyword can have at most ${MAX_TAGS_PER_KEYWORD} tags.`, ctx);
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

         return json({ keywords });
      }
      if (location !== undefined) {
         const rawLocation = typeof location === 'string' ? location.trim().substring(0, 255) : '';
         const requestedCountry = typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country) ? body.country : '';
         const locationCountry = requestedCountry || getLocationCountry(rawLocation);
         if (!locationCountry) {
            return fail(400, 'BAD_REQUEST', 'Country is required!', ctx);
         }
         // A country-only location names no city or state; anything else must give both, or the update would drop them
         const countryOnly = isCountryOnlyLocation(rawLocation);
         const parsedLocation = countryOnly ? { city: '', state: '' } : parseCityState(rawLocation);
         if (!hasValidCityStatePair(parsedLocation.city, parsedLocation.state)) {
            return fail(400, 'BAD_REQUEST', 'City and state must be provided together.', ctx);
         }
         // City-level locations store "City,State,Country Name"; country-only locations store a blank location
         const formattedLocation = buildStoredLocation({
            city: parsedLocation.city,
            state: parsedLocation.state,
            countryCode: locationCountry,
         }).substring(0, 255);
         const selectedKeywords: Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: keywordIDs } } });
         const domains = [...new Set(selectedKeywords.map((el) => el.domain))];

         // A location edit must not run next to a refresh: a scrape that finishes afterwards would write rankings
         // for the old location onto the keyword. Claim the domains first, the same way a delete does.
         const releaseDomains = refreshQueue.reserveDomains(domains);
         if (!releaseDomains) {
            const lockedDomains = domains.filter((domain) => refreshQueue.isDomainLocked(domain));
            logger.debug('[SCRAPER] Cannot change keyword locations while domains are being refreshed', { lockedDomains });
            return fail(409, 'CONFLICT', `Cannot change keyword locations while their domains are being refreshed: ${lockedDomains.join(', ')}. Try again once the refresh has finished.`, ctx);
         }
         let handedOff = false;
         try {
            // Re-read under the claim, so the plan matches the rows as they are now
            const lockedKeywords: Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: keywordIDs } } });
            // Other tracked keywords on the same domains, so a change cannot create a duplicate
            const otherKeywords: Keyword[] = domains.length > 0
               ? await Keyword.findAll({ where: { domain: { [Op.in]: domains }, ID: { [Op.notIn]: keywordIDs } } })
               : [];
            const toTarget = (el: Keyword) => ({ ID: el.ID, keyword: el.keyword, domain: el.domain, country: el.country, device: el.device, location: el.location || '' });
            const { acceptedIDs, skipped } = planLocationUpdate(
               lockedKeywords.map(toTarget),
               otherKeywords.map(toTarget),
               locationCountry,
               formattedLocation,
            );
            // Only keywords whose location or country really changes lose their rankings
            const acceptedSet = new Set(acceptedIDs);
            const changed = lockedKeywords.filter((el) => acceptedSet.has(el.ID)
               && ((el.location || '') !== formattedLocation || el.country !== locationCountry));
            const changedIDs = changed.map((el) => el.ID);

            if (changedIDs.length > 0) {
               // Rankings for the old location are wrong for the new one, so they go in the same commit as the move.
               // If the fresh scrape fails, the keyword stays empty rather than showing another city's positions.
               await db.transaction(async (transaction) => {
                  await Keyword.update({
                     location: formattedLocation,
                     country: locationCountry,
                     position: 0,
                     lastUpdated: null,
                     url: '',
                     history: JSON.stringify({}),
                     history7d: null,
                     lastResult: JSON.stringify([]),
                     mapPackTop3: toDbBool(false),
                     localResults: JSON.stringify([]),
                     lastUpdateError: 'false',
                     updating: toDbBool(false),
                     updatingStartedAt: null,
                  }, { where: { ID: { [Op.in]: changedIDs } }, transaction });
                  const countryChanged = changed.filter((keyword) => keyword.country !== locationCountry).map((keyword) => keyword.ID);
                  if (countryChanged.length > 0) {
                     await Keyword.update({ volume: 0 }, { where: { ID: { [Op.in]: countryChanged } }, transaction });
                  }
               });
               await retryQueueManager.removeBatch(new Set(changedIDs)).catch((error) => {
                  logger.error('Failed to clear moved keywords from the retry queue', error instanceof Error ? error : new Error(String(error)));
               });
               await refreshDomainStats(domains);

               // Queue a fresh scrape with the new location. The task takes over the domain claim, so nothing can
               // start a refresh in between.
               const settings = await getAppSettings();
               const movedRows: Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: changedIDs } } });
               await markKeywordsAsUpdating(movedRows, 'before location refresh', { keywordIds: changedIDs });
               await refreshQueue.enqueue(
                  `location-refresh-${changedIDs.join(',')}-${crypto.randomUUID()}`,
                  async () => {
                     try {
                        await refreshKeywordsByIds(changedIDs, settings);
                     } catch (error) {
                        await clearKeywordUpdatingFlags(movedRows, 'after location refresh failure', { keywordIds: changedIDs }, true);
                        logger.error('Failed to refresh keywords after a location change', error instanceof Error ? error : new Error(String(error)));
                     }
                  },
                  domains,
                  { reservations: [releaseDomains] },
               ).catch(async (error) => {
                  await clearKeywordUpdatingFlags(movedRows, 'after location enqueue failure', { keywordIds: changedIDs }, true);
                  logger.error('Failed to queue the refresh after a location change', error instanceof Error ? error : new Error(String(error)));
                  throw error;
               });
               handedOff = true;
            }

            const updatedKeywords:Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: keywordIDs } } });
            const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
            keywords = parseKeywords(formattedKeywords);
            return json({ keywords, updatedCount: changedIDs.length, skipped });
         } finally {
            if (!handedOff) { releaseDomains(); }
         }
      }
      return fail(400, 'BAD_REQUEST', 'Invalid Payload!', ctx);
   } catch (error) {
      logger.error('Updating Keyword. ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to update keywords.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'keywords', GET: getKeywords, POST: addKeywords, DELETE: deleteKeywords, PUT: updateKeywords });
