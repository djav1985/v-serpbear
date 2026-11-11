import Cryptr from 'cryptr';
import { mkdir, readFile } from 'fs/promises';
import { dirname } from 'path';
import Domain from '../../../../database/models/domain';
import Keyword from '../../../../database/models/keyword';
import { loadDomains } from '../../../../utils/domainsList';
import { checkSearchConsoleIntegration, removeLocalSCData } from '../../../../utils/searchConsole';
import { errorResponse } from '../../../../utils/api/response';
import { parseStrictBooleanQueryParam } from '../../../../utils/api/queryBoolean';
import { createRoute, fail, json, getParam, getQuery, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { validateHostname } from '../../../../utils/validators/hostname';
import { toDomainSlug } from '../../../../utils/domainSlug';
import { logger } from '../../../../utils/logger';
import { refreshQueue } from '../../../../utils/refreshQueue';
import {
   buildPersistedScraperSettings,
   maskDomainScraperSettings,
   parseDomainScraperSettings,
} from '../../../../utils/domainScraperSettings';
import { toDbBool } from '../../../../utils/dbBooleans';
import { safeJsonParse } from '../../../../utils/safeJsonParse';
import { maskSearchConsole } from '../../../../utils/maskSearchConsole';
import normalizeDomainBooleans from '../../../../utils/normalizeDomain';
import { retryQueueManager } from '../../../../utils/retryQueueManager';
import db from '../../../../database/database';
import { atomicWriteFile } from '../../../../utils/atomicWrite';
import { withFileLock } from '../../../../utils/fileLock';
import { removeDomainIdeasFile } from '../../../../utils/domainIdeasFile';

// Sent in place of a saved Search Console credential: GET responses mask it, and a save that sends it back keeps the stored value
const SC_CREDENTIAL_MARKER = 'true';
const DOMAIN_CLEANUP_RETRY_FILE = `${process.cwd()}/data/domain_cleanup_retry.json`;
type PendingCleanupMap = Map<string, Set<number>>;

const readPendingCleanupMap = async (): Promise<PendingCleanupMap> => {
   try {
      const raw = await readFile(DOMAIN_CLEANUP_RETRY_FILE, { encoding: 'utf-8' });
      const parsed = JSON.parse(raw) as Record<string, number[]>;
      const entries = Object.entries(parsed).map(([domain, ids]) => [
         domain,
         new Set((Array.isArray(ids) ? ids : []).filter((id): id is number => Number.isInteger(id) && id > 0)),
      ] as const);
      return new Map(entries);
   } catch (error: any) {
      if (error?.code === 'ENOENT') {
         return new Map();
      }
      logger.error('Failed reading domain cleanup retry state', error instanceof Error ? error : new Error(String(error)));
      return new Map();
   }
};

const persistPendingCleanupMap = async (map: PendingCleanupMap): Promise<void> => {
   const serialized: Record<string, number[]> = {};
   map.forEach((ids, domain) => {
      serialized[domain] = Array.from(ids);
   });
   await mkdir(dirname(DOMAIN_CLEANUP_RETRY_FILE), { recursive: true });
   await atomicWriteFile(DOMAIN_CLEANUP_RETRY_FILE, JSON.stringify(serialized), 'utf-8');
};

// Every read-modify-write of the retry file runs under this lock, so overlapping deletes cannot lose each other's entries
const withCleanupRetryLock = <T>(fn: () => Promise<T>): Promise<T> => withFileLock(DOMAIN_CLEANUP_RETRY_FILE, fn);

const updatePendingCleanup = (update: (map: PendingCleanupMap) => void): Promise<void> => withCleanupRetryLock(async () => {
   const map = await readPendingCleanupMap();
   update(map);
   await persistPendingCleanupMap(map);
});

/**
 * Repeats the auxiliary cleanup of an earlier delete whose cleanup did not finish. True only when every step succeeded.
 */
const retryOtherDomainCleanup = async (domain: string, keywordIds: Set<number>): Promise<boolean> => {
   let complete = true;
   if (keywordIds.size > 0) {
      try {
         await retryQueueManager.removeBatch(keywordIds);
      } catch (error) {
         complete = false;
         logger.error('Retrying pending retry-queue cleanup failed', error instanceof Error ? error : new Error(String(error)), { domain });
      }
   }
   try {
      if (!(await removeLocalSCData(domain))) {
         complete = false;
      }
   } catch (error) {
      complete = false;
      logger.error('Retrying pending Search Console cleanup failed', error instanceof Error ? error : new Error(String(error)), { domain });
   }
   return complete;
};

const getDomains = async (req: Request, ctx: ApiContext) => {
   const query = getQuery(req);
   const withStatsParam = query.withstats;
   const selectedDomainsParam = query.domains;
   let withStats = false;
   if (withStatsParam !== undefined) {
      const parsed = parseStrictBooleanQueryParam(withStatsParam);
      if (!parsed || !parsed.ok) {
         return fail(400, 'BAD_REQUEST', parsed?.message ?? 'Invalid parameter', ctx);
      }
      withStats = parsed.value;
   }

   let selectedDomains: string[] | undefined;
   if (selectedDomainsParam !== undefined) {
      const rawDomainParams = Array.isArray(selectedDomainsParam) ? selectedDomainsParam : [selectedDomainsParam];
      selectedDomains = [...new Set(rawDomainParams.flatMap((domains) => domains.split(',')).map((domain) => domain.trim()).filter(Boolean))];
      if (!withStats || selectedDomains.length === 0 || selectedDomains.length > 8 || selectedDomains.some((domain) => !validateHostname(domain).isValid)) {
         return fail(400, 'BAD_REQUEST', 'The domains parameter requires withstats=true and between 1 and 8 valid domain names.', ctx);
      }
   }
   
   try {
      
      const theDomains: DomainType[] = await loadDomains(withStats, selectedDomains);
      return json({ domains: theDomains });
   } catch (error) {
      logger.error('Getting Domains.', error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Getting Domains.', ctx);
   }
};

const addDomain = async (req: Request, ctx: ApiContext) => {
   const requestBody = await readJson(req);
   const { domains } = (requestBody && typeof requestBody === 'object' ? requestBody : {}) as { domains?: unknown };
   if (domains && Array.isArray(domains) && domains.length > 0) {
      const invalidDomains: string[] = [];
      const uniqueHosts = new Map<string, string>();

      domains.forEach((domain: string) => {
         const validation = validateHostname(domain);
         if (!validation.isValid) {
            invalidDomains.push(typeof domain === 'string' ? domain : '');
            return;
         }

         if (!uniqueHosts.has(validation.hostname)) {
            uniqueHosts.set(validation.hostname, validation.hostname);
         }
      });

      if (invalidDomains.length > 0) {
         const formatted = invalidDomains.filter(Boolean).join(', ') || 'blank domain';
         return fail(400, 'BAD_REQUEST', `Invalid domain(s): ${formatted}`, ctx);
      }

      const now = new Date().toJSON();
      const domainsToAdd: any = Array.from(uniqueHosts.values()).map((hostname) => ({
         domain: hostname,
         slug: toDomainSlug(hostname),
         lastUpdated: now,
         added: now,
         scrapeEnabled: toDbBool(true),
      }));

      if (domainsToAdd.length === 0) {
         return fail(400, 'BAD_REQUEST', 'No valid domains provided.', ctx);
      }

      try {
         const existingDomains: Domain[] = await Domain.findAll({ where: { domain: domainsToAdd.map((item: { domain: string }) => item.domain) }, attributes: ['domain'] });
         if (existingDomains.length > 0) {
            const alreadyTracked = existingDomains.map((domain) => domain.get({ plain: true }).domain);
            return fail(409, 'CONFLICT', `Already tracked: ${alreadyTracked.join(', ')}`, ctx);
         }

         const newDomains:Domain[] = await Domain.bulkCreate(domainsToAdd);
         const formattedDomains = newDomains.map((el) => normalizeDomainBooleans(el.get({ plain: true }) as DomainType));
         return json({ domains: formattedDomains }, 201);
      } catch (error) {
         // A concurrent request can add the same domain between the check above and the insert
         if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
            return fail(409, 'CONFLICT', 'Already tracked: this domain was added by another request.', ctx);
         }
         logger.error('Adding New Domain ', error instanceof Error ? error : new Error(String(error)));
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Adding Domain.', ctx);
      }
   } else {
      return fail(400, 'BAD_REQUEST', 'Necessary data missing.', ctx);
   }
};

const deleteDomain = async (req: Request, ctx: ApiContext) => {
   const requestBody = await readJson(req);
   const domainValue = requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)
      ? (requestBody as Record<string, unknown>).domain
      : undefined;
   if (typeof domainValue !== 'string' || !domainValue.trim()) {
      return fail(400, 'BAD_REQUEST', 'Domain is Required!', ctx);
   }
   const domain = domainValue;
   const normalizedDomain = domain.trim().toLowerCase();

   try {
      // Waiting in the queue behind a long refresh would leave this request hanging until it times out,
      // so reject it the same way deleting keywords does.
      // The claim also keeps new refreshes for this domain waiting until the delete task has started.
      const releaseDomain = refreshQueue.reserveDomains([normalizedDomain]);
      if (!releaseDomain) {
         logger.debug('[SCRAPER] Cannot delete domain while it is being refreshed', { domain: normalizedDomain });
         return fail(409, 'CONFLICT', `Cannot delete ${normalizedDomain} while it is being refreshed. Try again once the refresh has finished.`, ctx);
      }
      const taskId = `delete-domain-${normalizedDomain}-${Date.now()}`;
      let responsePayload: {
        status: number;
        body: unknown;
      } | null = null;

      await new Promise<void>((resolve, reject) => {
         refreshQueue.enqueue(
            taskId,
            async () => {
               try {
                  const pendingSnapshot = await withCleanupRetryLock(readPendingCleanupMap);
                  // Earlier deletes whose cleanup did not finish are retried first; the ones that succeed are dropped from the file
                  const clearedDomains: string[] = [];
                  for (const [pendingDomain, pendingIds] of pendingSnapshot) {
                     if (pendingDomain !== normalizedDomain && await retryOtherDomainCleanup(pendingDomain, pendingIds)) {
                        clearedDomains.push(pendingDomain);
                     }
                  }
                  const pendingKeywordIds = pendingSnapshot.get(normalizedDomain);
                  const domainToRemove = await Domain.findOne({ where: { domain: normalizedDomain }, attributes: ['ID'] });
                  // Keywords are looked up by domain even when the Domain row is gone, so no keyword is left orphaned
                  const keywordsToRemove = await Keyword.findAll({ where: { domain: normalizedDomain }, attributes: ['ID'] });
                  if (!domainToRemove && keywordsToRemove.length === 0 && !pendingKeywordIds) {
                     await updatePendingCleanup((map) => clearedDomains.forEach((domain) => map.delete(domain)));
                     responsePayload = { status: 404, body: errorResponse('NOT_FOUND', 'Domain not found', ctx.requestId) };
                     resolve();
                     return;
                  }
                  const keywordIdsToRemove = new Set<number>(keywordsToRemove.map((keyword) => keyword.ID).filter((id): id is number => Number.isFinite(id)));
                  pendingKeywordIds?.forEach((id) => keywordIdsToRemove.add(id));

                  let removedKeywordCount = 0;
                  let removedDomCount = 0;
                  await db.transaction(async (transaction) => {
                     removedKeywordCount = await Keyword.destroy({ where: { domain: normalizedDomain }, transaction });
                     removedDomCount = await Domain.destroy({ where: { domain: normalizedDomain }, transaction });
                     if (domainToRemove && removedDomCount !== 1) {
                        throw new Error('Domain disappeared during deletion transaction.');
                     }
                  });

                  // Never fails the delete: a leftover ideas file is only logged
                  await removeDomainIdeasFile(normalizedDomain);

                  const cleanupFailures: string[] = [];
                  if (keywordIdsToRemove.size > 0) {
                     try {
                        await retryQueueManager.removeBatch(keywordIdsToRemove);
                     } catch (error) {
                        cleanupFailures.push('retryQueue');
                        logger.error('Domain deleted, but retry queue cleanup failed', error instanceof Error ? error : new Error(String(error)), { domain: normalizedDomain });
                     }
                  }

                  let SCDataRemoved = false;
                  try {
                     SCDataRemoved = await removeLocalSCData(normalizedDomain);
                     if (!SCDataRemoved) {
                        cleanupFailures.push('searchConsole');
                        logger.debug('[GOOGLE] Domain deleted, but Search Console cleanup did not complete', { domain: normalizedDomain });
                     }
                  } catch (error) {
                     cleanupFailures.push('searchConsole');
                     logger.error('Domain deleted, but Search Console cleanup failed', error instanceof Error ? error : new Error(String(error)), { domain: normalizedDomain });
                  }

                  await updatePendingCleanup((map) => {
                     clearedDomains.forEach((domain) => map.delete(domain));
                     if (cleanupFailures.length > 0) {
                        map.set(normalizedDomain, keywordIdsToRemove);
                     } else {
                        map.delete(normalizedDomain);
                     }
                  });

                  responsePayload = {
                     status: 200,
                     body: {
                        domainRemoved: removedDomCount,
                        keywordsRemoved: removedKeywordCount,
                        SCDataRemoved,
                        cleanup: { complete: cleanupFailures.length === 0, failed: cleanupFailures, retryPending: cleanupFailures.length > 0 },
                     },
                  };
                  resolve();
               } catch (error) {
                  reject(error);
               }
            },
            [normalizedDomain],
            { reservations: [releaseDomain] },
         ).catch((error) => { releaseDomain(); reject(error); });
      });

      if (!responsePayload) {
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Deleting Domain.', ctx);
      }
      const finalizedResponse = responsePayload as { status: number; body: unknown };
      return json(finalizedResponse.body, finalizedResponse.status);
   } catch (error) {
      logger.error(`Error deleting domain: ${normalizedDomain}`, error instanceof Error ? error : new Error(String(error)));
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Deleting Domain.', ctx);
   }
};

/**
 * Copies the scrape_strategy and scrape_pagination_limit fields from the payload
 * into updates. A field is only written when it is present in the payload, and invalid values are dropped
 * (strategy falls back to '', pagination is clamped to 0-10).
 */
const applyScrapeOptionUpdates = (payload: Partial<DomainSettings>, updates: Partial<Domain>): void => {
   const { scrape_strategy, scrape_pagination_limit } = payload;
   if (Object.prototype.hasOwnProperty.call(payload, 'scrape_strategy')) {
      const validStrategies: Array<ScrapeStrategy | ''> = ['', 'basic', 'custom'];
      const strategy = scrape_strategy || '';
      updates.scrape_strategy = validStrategies.includes(strategy as ScrapeStrategy | '') ? strategy : '';
   }
   if (Object.prototype.hasOwnProperty.call(payload, 'scrape_pagination_limit')) {
      if (typeof scrape_pagination_limit === 'number' && Number.isFinite(scrape_pagination_limit)) {
         const clampedLimit = Math.min(10, Math.max(0, scrape_pagination_limit));
         updates.scrape_pagination_limit = clampedLimit;
      }
   }
};

const updateDomain = async (req: Request, ctx: ApiContext) => {
   const requestBody = await readJson(req);
   if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object.', ctx);
   }
   const body = requestBody as Record<string, unknown>;
   if (typeof body.domain !== 'string' || !body.domain.trim()) {
      return fail(400, 'BAD_REQUEST', 'Domain is Required!', ctx);
   }
   // Same normalisation as DELETE: domains are stored trimmed and lowercase
   const domain = body.domain.trim().toLowerCase();
   const payload = requestBody as Partial<DomainSettings>;
   const {
      notification_emails,
      search_console,
      scrapeEnabled,
      scraper_settings,
      business_name,
   } = payload;

   try {
      const domainToUpdate: Domain|null = await Domain.findOne({ where: { domain } });

      if (!domainToUpdate) {
         return fail(404, 'NOT_FOUND', 'Domain not found', ctx);
      }

      const domainPlain = domainToUpdate.get({ plain: true });

      // Validate SECRET is available for encryption operations
      if ((search_console?.client_email && search_console?.private_key) || Object.prototype.hasOwnProperty.call(payload, 'scraper_settings')) {
         if (!process.env.SECRET) {
            logger.error('SECRET environment variable not set for domain update encryption');
            return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error: encryption key not available', ctx);
         }
      }

      // Validate Search Console API Data
      if (search_console) {
         if (typeof search_console !== 'object' || Array.isArray(search_console)) {
            return fail(400, 'BAD_REQUEST', 'search_console must be an object.', ctx);
         }
         if ((['client_email', 'private_key'] as const).some((key) => search_console[key] != null && typeof search_console[key] !== 'string')) {
            return fail(400, 'BAD_REQUEST', 'search_console credentials must be text.', ctx);
         }
         const storedSearchConsole = safeJsonParse<Record<string, string> | null>(
            domainPlain?.search_console,
            null,
            { context: `domain ${domainPlain?.domain ?? ''} search_console`, logError: true },
         );
         const keepsStoredCredentials = search_console.client_email === SC_CREDENTIAL_MARKER
            && search_console.private_key === SC_CREDENTIAL_MARKER;

         if (keepsStoredCredentials) {
            // The form sends the marker back when the credentials were not changed: keep the stored encrypted values
            search_console.client_email = storedSearchConsole?.client_email ?? '';
            search_console.private_key = storedSearchConsole?.private_key ?? '';
         } else if (search_console.client_email === SC_CREDENTIAL_MARKER || search_console.private_key === SC_CREDENTIAL_MARKER) {
            return fail(400, 'BAD_REQUEST', 'Enter both client_email and private_key to change the Search Console credentials', ctx);
         }

         // Ensure both credentials are provided together, or neither
         const hasEmail = !!(search_console.client_email?.trim());
         const hasKey = !!(search_console.private_key?.trim());

         if (hasEmail !== hasKey) {
            return fail(400, 'BAD_REQUEST', 'Both client_email and private_key must be provided together for Search Console integration', ctx);
         }

         if (hasEmail && hasKey && !keepsStoredCredentials) {
            const isSearchConsoleAPIValid = await checkSearchConsoleIntegration({ ...domainPlain, search_console: JSON.stringify(search_console) });
            if (!isSearchConsoleAPIValid.isValid) {
               return fail(400, 'BAD_REQUEST', isSearchConsoleAPIValid.error ?? 'Invalid Search Console credentials', ctx);
            }
            const cryptr = new Cryptr(process.env.SECRET as string);
            search_console.client_email = cryptr.encrypt(search_console.client_email.trim());
            search_console.private_key = cryptr.encrypt(search_console.private_key.trim());
         }
      }

      const updates: Partial<Domain> = {};
      if (typeof notification_emails === 'string') { updates.notification_emails = notification_emails; }
      if (typeof scrapeEnabled === 'boolean') {
         // Convert boolean to 1/0 for database storage
         updates.scrapeEnabled = toDbBool(scrapeEnabled);
      }
      if (search_console) {
         updates.search_console = JSON.stringify(search_console);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'business_name')) {
         updates.business_name = business_name || null;
      }
      applyScrapeOptionUpdates(payload, updates);
      if (Object.prototype.hasOwnProperty.call(payload, 'scraper_settings')) {
         const existingScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
         const cryptr = new Cryptr(process.env.SECRET as string);
         const persistedOverride = buildPersistedScraperSettings(scraper_settings ?? null, existingScraperSettings, cryptr);
         updates.scraper_settings = persistedOverride ? JSON.stringify(persistedOverride) : null;
      }
      domainToUpdate.set(updates);
      await domainToUpdate.save();

      const savedPlain = domainToUpdate.get({ plain: true }) as any;
      const searchConsoleData = maskSearchConsole(savedPlain?.search_console, String(savedPlain?.domain ?? savedPlain?.ID ?? ''));
      const persistedScraperSettingsAfter = parseDomainScraperSettings(savedPlain?.scraper_settings);
      const maskedDomain = {
         ...savedPlain,
         search_console: JSON.stringify(searchConsoleData),
         scraper_settings: maskDomainScraperSettings(persistedScraperSettingsAfter),
      } as DomainType;
      return json({ domain: normalizeDomainBooleans(maskedDomain) });
   } catch (error) {
      logger.error('Updating Domain: ', error instanceof Error ? error : new Error(String(error)), { context: domain });
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Error Updating Domain. An Unknown Error Occurred.', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'domains', GET: getDomains, POST: addDomain, DELETE: deleteDomain, PUT: updateDomain });
