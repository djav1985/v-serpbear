/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import getdomainStats from '../../utils/domains';
import verifyUser from '../../utils/verifyUser';
import { checkSearchConsoleIntegration, removeLocalSCData } from '../../utils/searchConsole';
import { withApiLogging } from '../../utils/apiLogging';
import { validateHostname } from '../../utils/validators/hostname';
import { logger } from '../../utils/logger';
import { refreshQueue } from '../../utils/refreshQueue';
import {
   buildPersistedScraperSettings,
   maskDomainScraperSettings,
   parseDomainScraperSettings,
} from '../../utils/domainScraperSettings';
import { toDbBool } from '../../utils/dbBooleans';
import { safeJsonParse } from '../../utils/safeJsonParse';
import normalizeDomainBooleans from '../../utils/normalizeDomain';

/**
 * Parses a query parameter as a boolean value.
 * Maintains backward compatibility with existing API clients.
 * @param value - The query parameter value to parse (if an array, the last element is used)
 * @returns true if value is 'true' or any other non-empty value except 'false', false otherwise
 */
const parseBooleanQueryParam = (value: string | string[] | undefined): boolean => {
   if (!value) return false;
   // Handle arrays by extracting the last element
   const normalized = Array.isArray(value)
      ? (value.length > 0 ? value[value.length - 1] : undefined)
      : value;
   if (!normalized) return false;
   if (normalized === 'true') return true;
   if (normalized === 'false') return false;
   return true; // Any other non-empty value is considered true (backward compatibility)
};

type DomainsGetRes = {
   domains: DomainType[]
   total: number,
   limit: number,
   offset: number,
   error?: string|null,
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parsePagingParam = (value: string | string[] | undefined, fallback: number): number => {
   const normalized = Array.isArray(value) ? value[value.length - 1] : value;
   const parsed = Number.parseInt(normalized || '', 10);
   return Number.isFinite(parsed) ? parsed : fallback;
};

type DomainsAddResponse = {
   domains: DomainType[]|null,
   error?: string|null,
}

type DomainsDeleteRes = {
   domainRemoved: number,
   keywordsRemoved: number,
   SCDataRemoved: boolean,
   error?: string|null,
}

type DomainsUpdateRes = {
   domain: DomainType | null,
   error?: string|null,
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   // Check authentication for all requests now - changed from previous behavior
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   
   if (req.method === 'GET') {
      return getDomains(req, res);
   }
   if (req.method === 'POST') {
      return addDomain(req, res);
   }
   if (req.method === 'DELETE') {
      return deleteDomain(req, res);
   }
   if (req.method === 'PUT') {
      return updateDomain(req, res);
   }
   return res.status(405).json({ error: 'Method not allowed' });
};

export const getDomains = async (req: NextApiRequest, res: NextApiResponse<DomainsGetRes>) => {
   const withStats = parseBooleanQueryParam(req?.query?.withstats);
   const requestedLimit = parsePagingParam(req?.query?.limit, DEFAULT_LIMIT);
   const requestedOffset = parsePagingParam(req?.query?.offset, 0);
   const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
   const offset = Math.max(requestedOffset, 0);
   
   try {
      const domainAttributes = [
         'ID',
         'domain',
         'slug',
         'notification',
         'notification_interval',
         'notification_emails',
         'lastUpdated',
         'added',
         'avgPosition',
         'mapPackKeywords',
         'search_console',
         'scrapeEnabled',
         'scraper_settings',
         'business_name',
         'scrape_strategy',
         'scrape_pagination_limit',
         'scrape_smart_full_fallback',
      ];

      const domainResult = await Domain.findAndCountAll({
         attributes: domainAttributes,
         limit,
         offset,
         order: [['domain', 'ASC']],
      });

      const formattedDomains: DomainType[] = domainResult.rows.map((el) => {
         const domainPlain = el.get({ plain: true }) as any;
         const scData = safeJsonParse<Record<string, string> | null>(
            domainPlain?.search_console,
            null,
            { context: `domain ${domainPlain?.domain ?? domainPlain?.ID ?? ''} search_console`, logError: true },
         );
         const { client_email, private_key } = scData || {};
         const searchConsoleData = scData
            ? {
               ...scData,
               client_email: client_email ? 'true' : '',
               private_key: private_key ? 'true' : '',
            }
            : {};
         const persistedScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
         const maskedDomain = {
            ...domainPlain,
            search_console: JSON.stringify(searchConsoleData),
            scraper_settings: maskDomainScraperSettings(persistedScraperSettings),
         } as DomainType;
         return normalizeDomainBooleans(maskedDomain);
      });
      const theDomains: DomainType[] = withStats ? await getdomainStats(formattedDomains) : formattedDomains;
      return res.status(200).json({ domains: theDomains, total: domainResult.count, limit, offset });
   } catch (error) {
      logger.error('Getting Domains.', error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json({ domains: [], total: 0, limit, offset, error: 'Error Getting Domains.' });
   }
};

const addDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsAddResponse>) => {
   const { domains } = req.body;
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
         return res.status(400).json({ domains: [], error: `Invalid domain(s): ${formatted}` });
      }

      const now = new Date().toJSON();
      const domainsToAdd: any = Array.from(uniqueHosts.values()).map((hostname) => ({
         domain: hostname,
         slug: hostname.replaceAll('-', '_').replaceAll('.', '-').replaceAll('/', '-'),
         lastUpdated: now,
         added: now,
         scrapeEnabled: toDbBool(true),
         notification: toDbBool(true),
      }));

      if (domainsToAdd.length === 0) {
         return res.status(400).json({ domains: [], error: 'No valid domains provided.' });
      }

      try {
         const newDomains:Domain[] = await Domain.bulkCreate(domainsToAdd);
         const formattedDomains = newDomains.map((el) => normalizeDomainBooleans(el.get({ plain: true }) as DomainType));
         return res.status(201).json({ domains: formattedDomains });
      } catch (error) {
         logger.error('Adding New Domain ', error instanceof Error ? error : new Error(String(error)));
         return res.status(400).json({ domains: [], error: 'Error Adding Domain.' });
      }
   } else {
      return res.status(400).json({ domains: [], error: 'Necessary data missing.' });
   }
};

export const deleteDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsDeleteRes>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Domain is Required!' });
   }
   
   const { domain } = req.query || {};
   
   // Check if domain is currently being refreshed
   if (refreshQueue.isDomainLocked(domain as string)) {
      logger.warn(`Cannot delete domain while refresh is in progress`, { domain });
      return res.status(409).json({ 
         domainRemoved: 0, 
         keywordsRemoved: 0, 
         SCDataRemoved: false, 
         error: `Cannot delete domain "${domain}" while a refresh is in progress. Please wait for the refresh to complete or try again later.`,
      });
   }
   
   try {
      const removedDomCount: number = await Domain.destroy({ where: { domain } });
      if (removedDomCount === 0) {
         return res.status(404).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Domain not found' });
      }
      const removedKeywordCount: number = await Keyword.destroy({ where: { domain } });
      const SCDataRemoved = await removeLocalSCData(domain as string);
      return res.status(200).json({ domainRemoved: removedDomCount, keywordsRemoved: removedKeywordCount, SCDataRemoved });
   } catch (error) {
      logger.error(`Error deleting domain: ${req.query.domain}`, error instanceof Error ? error : new Error(String(error)));
      return res.status(400).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Error Deleting Domain' });
   }
};

export const updateDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsUpdateRes>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json({ domain: null, error: 'Domain is Required!' });
   }
   const { domain } = req.query || {};
   const payload = req.body as Partial<DomainSettings>;
   const {
      notification_interval,
      notification_emails,
      search_console,
      scrapeEnabled,
      scraper_settings,
      business_name,
      scrape_strategy,
      scrape_pagination_limit,
      scrape_smart_full_fallback,
   } = payload;

   try {
      const domainToUpdate: Domain|null = await Domain.findOne({ where: { domain } });

      if (!domainToUpdate) {
         return res.status(404).json({ domain: null, error: 'Domain not found' });
      }

      const domainPlain = domainToUpdate.get({ plain: true });

      // Validate SECRET is available for encryption operations
      if ((search_console?.client_email && search_console?.private_key) || Object.prototype.hasOwnProperty.call(payload, 'scraper_settings')) {
         if (!process.env.SECRET) {
            logger.error('SECRET environment variable not set for domain update encryption');
            return res.status(500).json({ domain: null, error: 'Server configuration error: encryption key not available' });
         }
      }

      // Validate Search Console API Data
      if (search_console) {
         // Ensure both credentials are provided together, or neither
         const hasEmail = !!(search_console.client_email?.trim());
         const hasKey = !!(search_console.private_key?.trim());
         
         if (hasEmail !== hasKey) {
            return res.status(400).json({ 
               domain: null, 
               error: 'Both client_email and private_key must be provided together for Search Console integration',
            });
         }
         
         if (hasEmail && hasKey) {
            const isSearchConsoleAPIValid = await checkSearchConsoleIntegration({ ...domainPlain, search_console: JSON.stringify(search_console) });
            if (!isSearchConsoleAPIValid.isValid) {
               return res.status(400).json({ domain: null, error: isSearchConsoleAPIValid.error });
            }
            const cryptr = new Cryptr(process.env.SECRET as string);
            search_console.client_email = cryptr.encrypt(search_console.client_email.trim());
            search_console.private_key = cryptr.encrypt(search_console.private_key.trim());
         }
      }

      const updates: Partial<Domain> = {};
      if (typeof notification_interval === 'string') { updates.notification_interval = notification_interval; }
      if (typeof notification_emails === 'string') { updates.notification_emails = notification_emails; }
      if (typeof scrapeEnabled === 'boolean') {
         // Convert boolean to 1/0 for database storage
         updates.scrapeEnabled = toDbBool(scrapeEnabled);
         // Update the legacy notification field to match scrapeEnabled
         updates.notification = toDbBool(scrapeEnabled);
      }
      if (search_console) {
         updates.search_console = JSON.stringify(search_console);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'business_name')) {
         updates.business_name = business_name || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'scrape_strategy')) {
         const validStrategies: Array<ScrapeStrategy | ''> = ['', 'basic', 'custom', 'smart'];
         const strategy = scrape_strategy || '';
         updates.scrape_strategy = validStrategies.includes(strategy as ScrapeStrategy | '') ? strategy : '';
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'scrape_pagination_limit')) {
         if (typeof scrape_pagination_limit === 'number' && Number.isFinite(scrape_pagination_limit)) {
            const clampedLimit = Math.min(10, Math.max(0, scrape_pagination_limit));
            updates.scrape_pagination_limit = clampedLimit;
         }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'scrape_smart_full_fallback')) {
         if (typeof scrape_smart_full_fallback === 'boolean') {
            updates.scrape_smart_full_fallback = scrape_smart_full_fallback;
         }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'scraper_settings')) {
         const existingScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
         const cryptr = new Cryptr(process.env.SECRET as string);
         const persistedOverride = buildPersistedScraperSettings(scraper_settings ?? null, existingScraperSettings, cryptr);
         updates.scraper_settings = persistedOverride ? JSON.stringify(persistedOverride) : null;
      }
      domainToUpdate.set(updates);
      await domainToUpdate.save();

      const normalizedDomain = normalizeDomainBooleans(domainToUpdate.get({ plain: true }) as DomainType);
      return res.status(200).json({ domain: normalizedDomain });
   } catch (error) {
      logger.error('Updating Domain: ', error instanceof Error ? error : new Error(String(error)), { context: req.query.domain });
      return res.status(400).json({ domain: null, error: 'Error Updating Domain. An Unknown Error Occurred.' });
   }
};

export default withApiLogging(handler, {
   name: 'domains',
   logBody: false,
});
