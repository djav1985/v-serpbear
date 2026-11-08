import crypto from 'crypto';
import { Op } from 'sequelize';
import Keyword from '../../../../database/models/keyword';
import { refreshKeywordsByIds, clearKeywordUpdatingFlags, markKeywordsAsUpdating, partitionKeywordsByDomainStatus } from '../../../../utils/refresh';
import { getAppSettings } from '../../../../utils/appSettings';
import { scrapeKeywordWithStrategy } from '../../../../utils/scraper';
import { serializeError } from '../../../../utils/errorSerialization';
import { logger } from '../../../../utils/logger';
import { createRoute, fail, json, getParam, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { refreshQueue } from '../../../../utils/refreshQueue';
import { takeRateLimitToken } from '../../../../utils/rateLimit';
import { getClientIp } from '../../../../utils/api/clientIp';
import { isKeywordUpdating } from '../../../../utils/keywordUpdating';
import { isSameOriginRequest } from '../../../../utils/api/sameOrigin';
import { hasValidSessionCookie, isBearerAuthorization } from '../../../../utils/verifyUser';

/**
 * Parses a comma separated list of keyword IDs. Returns null when any item is not a positive integer,
 * so callers can answer 400 instead of silently dropping bad input.
 */
const parseKeywordIds = (raw: string): number[] | null => {
   const items = raw.split(',').map((item) => item.trim());
   if (items.some((item) => !/^[1-9]\d*$/.test(item))) {
      return null;
   }
   const ids = Array.from(new Set(items.map((item) => Number(item))));
   return ids.every((id) => Number.isSafeInteger(id)) ? ids : null;
};

/** The JSON body as an object; null, arrays and other types read as an empty object. */
const readBody = async (req: Request): Promise<Record<string, any>> => {
   const body = await readJson(req);
   return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, any> : {};
};

const getRetryStatus = async (req: Request, ctx: ApiContext) => {
   const idParam = getParam(req, 'id');
   if (!idParam) {
      return fail(400, 'BAD_REQUEST', 'keyword ID is Required!', ctx);
   }

   const keywordIDs = parseKeywordIds(idParam);
   if (!keywordIDs) {
      return fail(400, 'BAD_REQUEST', 'No valid keyword IDs provided', ctx);
   }

   try {
      const keywords = await Keyword.findAll({
         where: { ID: { [Op.in]: keywordIDs } },
         attributes: ['ID', 'updating', 'updatingStartedAt'],
      });
      return json({
         // A flag left behind by a crashed run is reported as not updating, matching what a refresh would do
         keywords: keywords.map((keyword) => {
            const plainKeyword = keyword.get({ plain: true });
            return { ID: plainKeyword.ID, updating: isKeywordUpdating(plainKeyword) };
         }),
      });
   } catch (error) {
      logger.error('Error reading retry status', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to read retry status', ctx);
   }
};

/**
 * Keyword IDs to refresh: the JSON body `ids` array when sent (null if any item is not a positive integer),
 * otherwise the legacy comma-separated `id` query.
 */
const readKeywordIds = async (req: Request): Promise<number[] | null> => {
   const body = await readBody(req);
   if (body.ids !== undefined) {
      const ids: unknown = body.ids;
      const valid = Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0);
      return valid ? Array.from(new Set(ids as number[])) : null;
   }
   const idParam = getParam(req, 'id');
   return idParam ? parseKeywordIds(idParam) : null;
};

/**
 * A request that is not authenticated by an API key is a browser session, so it must come from this site. A page on
 * another site cannot make a logged-in browser start a refresh or a search. API key requests are checked by the key.
 */
const isCrossSiteBrowserRequest = (req: Request): boolean => (
   !isBearerAuthorization(req.headers.get('authorization') ?? undefined) && !isSameOriginRequest(req)
);

const refreshTheKeywords = async (req: Request, ctx: ApiContext) => {
   if (isCrossSiteBrowserRequest(req)) {
      return fail(403, 'FORBIDDEN', 'Refreshes must be started from this site.', ctx);
   }
   const body = await readBody(req);
   // A body with a keyword is a one-off keyword search (see searchKeyword), not a refresh
   if (body.keyword !== undefined) {
      return searchKeyword(req, body, ctx);
   }
   const idsInBody = body.ids !== undefined;
   if (!idsInBody && !getParam(req, 'id')) {
      return fail(400, 'BAD_REQUEST', 'keyword ID is Required!', ctx);
   }
   const refreshAll = !idsInBody && getParam(req, 'id') === 'all';
   if (refreshAll && !getParam(req, 'domain')) {
      return fail(400, 'BAD_REQUEST', 'When Refreshing all Keywords of a domian, the Domain name Must be provided.', ctx);
   }
   const keywordIDs = refreshAll ? [] : await readKeywordIds(req);
   const domain = getParam(req, 'domain');
   if (domain !== undefined && typeof domain !== 'string') {
      return fail(400, 'BAD_REQUEST', 'domain must be a single domain name.', ctx);
   }
   logger.debug('[SCRAPER] keywordIDs: ', { data: keywordIDs });

   if (!refreshAll && (!keywordIDs || keywordIDs.length === 0)) {
      return fail(400, 'BAD_REQUEST', 'No valid keyword IDs provided', ctx);
   }

   const clearUpdatingFlags = async (keywords: Keyword[], logContext: string, reason: string, onlyWhenUpdating = false) => {
      await clearKeywordUpdatingFlags(keywords, logContext, {
         keywordIds: keywords.map((kw) => kw.ID),
      }, onlyWhenUpdating, reason);
   };

   try {
      const settings = await getAppSettings();
      
      if (!settings || (settings && settings.scraper_type === 'none')) {
         logger.debug('[SCRAPER] Scraper not configured');
         return fail(400, 'BAD_REQUEST', 'Scraper has not been set up yet.', ctx);
      }
      const query = refreshAll && domain ? { domain } : { ID: { [Op.in]: keywordIDs } };
      const keywordQueries: Keyword[] = await Keyword.findAll({ where: query });

      if (keywordQueries.length === 0) {
         return fail(404, 'NOT_FOUND', 'No keywords found for the provided filters.', ctx);
      }

      const {
         keywordsToRefresh,
         skippedKeywords,
         missingDomainKeywords,
      } = await partitionKeywordsByDomainStatus(keywordQueries);

      // Handle keywords whose domain is missing from the Domain table
      if (missingDomainKeywords.length > 0) {
         const missingDomains = Array.from(new Set(missingDomainKeywords.map((kw) => kw.domain)));
         logger.error('Keywords found with domains not in Domain table', undefined, {
            domains: missingDomains,
            keywordCount: missingDomainKeywords.length,
            keywordIds: missingDomainKeywords.map((kw) => kw.ID),
         });
         
         // Clear updating flags for these keywords
         await clearUpdatingFlags(missingDomainKeywords, 'for missing domains', 'missing-domain');
         
         // Remove missing domain keywords from retry queue
         const missingKeywordIds = new Set(missingDomainKeywords.map((kw) => kw.ID));
         if (missingKeywordIds.size > 0) {
            const { retryQueueManager } = await import('../../../../utils/retryQueueManager');
            await retryQueueManager.removeBatch(missingKeywordIds).catch((error) => {
               logger.error('Failed to remove missing domain keywords from retry queue', error instanceof Error ? error : new Error(String(error)));
            });
         }
         
         // Return error if all keywords have missing domains
         if (keywordsToRefresh.length === 0 && skippedKeywords.length === 0) {
            return fail(400, 'BAD_REQUEST', `Domains not found in database: ${missingDomains.join(', ')}. Please ensure domains are created before adding keywords.`, ctx);
         }
      }

      if (skippedKeywords.length > 0) {
         await clearUpdatingFlags(skippedKeywords, 'for skipped keywords', 'scrape-disabled');
      }

      if (keywordsToRefresh.length === 0) {
         return json({ keywords: [] });
      }

      // Keywords a live run is already refreshing are skipped. A stale flag (crashed run) does not count.
      const updatingKeywordIds: number[] = [];
      const candidateKeywords = keywordsToRefresh.filter((keyword) => {
         if (isKeywordUpdating(keyword)) {
            updatingKeywordIds.push(keyword.ID);
            return false;
         }
         return true;
      });

      // Claim each domain on its own. The check and the claim happen in the same tick, so two quick requests
      // cannot both pass it while the keywords are being marked as updating below. A locked domain is skipped
      // and the rest of the request still runs.
      const releases: Array<() => void> = [];
      const claimedDomains = new Set<string>();
      const lockedDomains: string[] = [];
      try {
         const candidateDomains = Array.from(new Set(candidateKeywords.map((keyword) => keyword.domain).filter(Boolean)));
         for (const candidateDomain of candidateDomains) {
            const release = refreshQueue.reserveDomains([candidateDomain]);
            if (release) {
               releases.push(release);
               claimedDomains.add(candidateDomain);
            } else {
               lockedDomains.push(candidateDomain);
            }
         }

         const keywordsToStart = candidateKeywords.filter((keyword) => claimedDomains.has(keyword.domain));
         const lockedKeywordIds = candidateKeywords
            .filter((keyword) => lockedDomains.includes(keyword.domain))
            .map((keyword) => keyword.ID);
         const skipped = {
            domains: lockedDomains,
            keywordIds: [...updatingKeywordIds, ...lockedKeywordIds],
         };

         // 409 only when nothing at all could be started
         if (keywordsToStart.length === 0) {
            logger.debug('[SCRAPER] Manual refresh rejected: nothing could be started', { lockedDomains, updatingKeywordIds });
            const message = lockedDomains.length > 0
               ? `Domains are already being refreshed: ${lockedDomains.join(', ')}. Please wait for the current refresh to complete.`
               : `Keywords are already being refreshed: ${updatingKeywordIds.join(', ')}. Please wait for the current refresh to complete.`;
            return fail(409, 'CONFLICT', message, ctx);
         }

         const domainsToRefresh = Array.from(claimedDomains);
         const keywordIdsToRefresh = keywordsToStart.map((keyword) => keyword.ID);
         await markKeywordsAsUpdating(keywordsToStart, 'before manual refresh', {
            keywordIds: keywordIdsToRefresh,
         });

         // Generate unique task ID using crypto to prevent collisions in concurrent scenarios
         const uniqueId = crypto.randomUUID();
         const taskId = refreshAll
            ? `manual-refresh-domain-${domain}-${uniqueId}`
            : `manual-refresh-ids-${keywordIdsToRefresh.join(',')}-${uniqueId}`;
         logger.info(`[SCRAPER] Manual refresh enqueued: ${taskId} (${keywordsToStart.length} keywords)`, { domains: domainsToRefresh, skipped });

         // Enqueue the manual refresh task with its domains for per-domain locking
         // This prevents the same domain from being refreshed multiple times simultaneously
         // but allows different domains to process in parallel
         refreshQueue.enqueue(
            taskId,
            async () => {
               try {
                  // Loads the rows when the task starts, so a keyword deleted or moved while it waited is handled
                  await refreshKeywordsByIds(keywordIdsToRefresh, settings);
               } catch (refreshError) {
                  const message = serializeError(refreshError);
                  logger.error('[REFRESH] ERROR refreshAndUpdateKeywords: ', refreshError instanceof Error ? refreshError : new Error(message), { keywordIds: keywordIdsToRefresh });
                  // Ensure flags are cleared on error, only for keywords still in updating state
                  await clearUpdatingFlags(keywordsToStart, 'after refresh error', 'refresh-error', true).catch((updateError) => {
                     logger.error('[REFRESH] Failed to clear updating flags after error: ', updateError instanceof Error ? updateError : new Error(String(updateError)));
                  });
                  throw refreshError; // Re-throw to be caught by queue error handler
               }
            },
            domainsToRefresh,
            // The queued task takes over the domain claims, so a delete or location edit cannot slip in before it starts
            { reservations: releases }
         );

         // Return immediately with 200 OK status; skipped lists what was not started and why
         return json({
            message: 'Refresh started',
            keywordCount: keywordsToStart.length,
            skipped,
         });
      } finally {
         // The tasks are now in the queue (which also locks the domains), or the request failed
         releases.forEach((release) => release());
      }
   } catch (error) {
      logger.error('[REFRESH] ERROR refreshTheKeywords: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to start the refresh.', ctx);
   }
};

const KEYWORD_SEARCHES_PER_MINUTE = 20;

/**
 * A one-off keyword search, which is a paid provider request. It is a POST with the JSON body { keyword, country, device }.
 * Only a logged-in browser session can run one; an API key cannot. refreshTheKeywords has already checked the origin.
 */
const searchKeyword = async (req: Request, body: Record<string, any>, ctx: ApiContext) => {
   if (!hasValidSessionCookie(req)) {
      return fail(403, 'FORBIDDEN', 'Keyword searches need a logged-in session.', ctx);
   }
   const keyword: unknown = body.keyword;
   const country: unknown = body.country;
   if (typeof keyword !== 'string' || !keyword || typeof country !== 'string' || !country) {
      return fail(400, 'BAD_REQUEST', 'A Valid keyword and Country Code is Required!', ctx);
   }
   const device = typeof body.device === 'string' && body.device ? body.device : 'desktop';
   // Each search is a paid provider request, so limit how many one client can start per minute
   const clientKey = `keyword-search:${getClientIp(req)}`;
   if (!takeRateLimitToken(clientKey, KEYWORD_SEARCHES_PER_MINUTE, 60 * 1000)) {
      return fail(429, 'TOO_MANY_REQUESTS', 'Too many keyword searches. Please wait a minute and try again.', ctx);
   }
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         return fail(400, 'BAD_REQUEST', 'Scraper has not been set up yet.', ctx);
      }
      const requestedDevice = device;
      const dummyKeyword:KeywordType = {
         ID: 99999999999999,
         keyword,
         device: requestedDevice,
         country,
         domain: '',
         lastUpdated: '',
         volume: 0,
         added: '',
         position: 0,
         sticky: false,
         history: {},
         lastResult: [],
         url: '',
         tags: [],
         updating: false,
         lastUpdateError: false,
         mapPackTop3: false,
      };
      const scrapeResult = await scrapeKeywordWithStrategy(dummyKeyword, settings);
      if (scrapeResult && !scrapeResult.error) {
         const searchResult = {
            results: scrapeResult.result,
            keyword: scrapeResult.keyword,
            position: scrapeResult.position,
            country,
            device: requestedDevice,
         };
         return json({ searchResult });
      }
      // The scraper was configured and the request was valid, so a failed scrape is an upstream failure, not a bad request
      logger.warn('Keyword search scrape failed', { error: scrapeResult ? String((scrapeResult as { error?: unknown }).error ?? 'no result') : 'no result' });
      return fail(502, 'BAD_GATEWAY', 'Error Scraping Search Results for the given keyword!', ctx);
   } catch (error) {
      logger.error('ERROR searchKeyword: ', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Failed to search for the keyword.', ctx);
   }
};

// GET is read-only: ?status=retry reports which keywords are still updating. Starting a refresh or a search is a POST,
// so a link or an image on another site cannot trigger provider requests.
const refreshGet = (req: Request, ctx: ApiContext) => (
   getParam(req, 'status') === 'retry'
      ? getRetryStatus(req, ctx)
      : fail(405, 'METHOD_NOT_ALLOWED', 'Use POST to start a refresh or a keyword search', ctx, undefined, { Allow: 'GET, POST' })
);

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'refresh', GET: refreshGet, POST: refreshTheKeywords });
