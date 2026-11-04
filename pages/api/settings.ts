/// <reference path="../../types.d.ts" />

import { readFile, access } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import { logger } from '../../utils/logger';
import Cookies from 'cookies';
import verifyUser, { verifySessionToken } from '../../utils/verifyUser';
import allScrapers from '../../scrapers/index';
import { withApiLogging } from '../../utils/apiLogging';
import { trimStringProperties } from '../../utils/security';
import { getBranding } from '../../utils/branding';
import packageJson from '../../package.json';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { withSettingsLock } from '../../utils/settingsFile';
import { retryQueueManager } from '../../utils/retryQueueManager';
import { errorResponse } from '../../utils/api/response';
import { normalizeLegacyGlobalScraperType } from '../../utils/removedScrapers';

const buildSettingsDefaults = (): SettingsType => {
   const { platformName } = getBranding();
   return {
      scraper_type: 'none',
      scraping_api: '',
      notification_interval: 'never',
      notification_email: '',
      notification_email_from: '',
      notification_email_from_name: platformName,
      smtp_server: '',
      smtp_port: '',
      smtp_tls_servername: '',
      smtp_username: '',
      smtp_password: '',
      scrape_interval: '',
      scrape_delay: '',
      scrape_retry: false,
      scrape_strategy: 'basic' as ScrapeStrategy,
      scrape_pagination_limit: 5,
      scrape_smart_full_fallback: false,
      search_console: true,
      search_console_client_email: '',
      search_console_private_key: '',
      adwords_client_id: '',
      adwords_client_secret: '',
      adwords_refresh_token: '',
      adwords_developer_token: '',
      adwords_account_id: '',
      keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
   };
};


const normalizeLegacySettings = (settings: Partial<SettingsType>): Partial<SettingsType> => {
   const normalizedSettings = { ...settings } as Partial<SettingsType> & { proxy?: string };

   if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'scraper_type')) {
      normalizedSettings.scraper_type = normalizeLegacyGlobalScraperType(normalizedSettings.scraper_type);
   }

   if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'proxy')) {
      delete normalizedSettings.proxy;
   }

   return normalizedSettings;
};

const SCRAPE_STRATEGIES = ['basic', 'custom', 'smart'];
const NOTIFICATION_INTERVALS = ['daily', 'weekly', 'monthly', 'never'];
const MAX_PAGINATION_LIMIT = 10;
const BOOLEAN_SETTINGS = ['scrape_retry', 'scrape_smart_full_fallback', 'search_console'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Checks only the fields present in the payload. Returns one message per invalid field
 * (an empty array when the payload is valid).
 */
export const validateSettingsPayload = (settings: Record<string, unknown>): string[] => {
   const errors: string[] = [];
   const has = (key: string) => settings[key] !== undefined;

   if (has('scraper_type')) {
      const validScrapers = ['none', ...allScrapers.map((scraper) => scraper.id)];
      if (!validScrapers.includes(settings.scraper_type as string)) {
         errors.push(`Unknown scraper type: ${String(settings.scraper_type)}.`);
      }
   }
   if (has('scrape_strategy') && !SCRAPE_STRATEGIES.includes(settings.scrape_strategy as string)) {
      errors.push('scrape_strategy must be basic, custom or smart.');
   }
   if (has('scrape_pagination_limit')) {
      const limit = Number(settings.scrape_pagination_limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGINATION_LIMIT) {
         errors.push(`scrape_pagination_limit must be a whole number from 1 to ${MAX_PAGINATION_LIMIT}.`);
      }
   }
   if (has('notification_interval') && !NOTIFICATION_INTERVALS.includes(settings.notification_interval as string)) {
      errors.push('notification_interval must be daily, weekly, monthly or never.');
   }
   BOOLEAN_SETTINGS.forEach((key) => {
      if (has(key) && typeof settings[key] !== 'boolean') {
         errors.push(`${key} must be true or false.`);
      }
   });
   if (has('smtp_port') && settings.smtp_port !== '') {
      const port = Number(settings.smtp_port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
         errors.push('smtp_port must be a number from 1 to 65535.');
      }
   }
   if (has('notification_email') && settings.notification_email !== '' && !EMAIL_PATTERN.test(String(settings.notification_email))) {
      errors.push('notification_email must be a valid email address.');
   }
   if (has('keywordsColumns') && (!Array.isArray(settings.keywordsColumns) || !settings.keywordsColumns.every((column) => typeof column === 'string'))) {
      errors.push('keywordsColumns must be a list of column names.');
   }

   return errors;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   // Allow GET requests without authentication for public settings
   if (req.method === 'GET') {
      return getSettings(req, res);
   }
   
   // All other methods require authentication
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   
   if (req.method === 'PUT') {
      return updateSettings(req, res);
   }
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
};

const getSettings = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   try {
      // Silently check if user is authenticated without logging auth failures for anonymous GETs
      let isAuthenticated = false;
      try {
         const cookies = new Cookies(req, res);
         const token = cookies.get('token');
         // Same check as verifyUser, including the session version, so a token revoked by logout is rejected here too
         if (token) {
            verifySessionToken(token);
            isAuthenticated = true;
         }
      } catch (_) { /* not authenticated — silent for public endpoint */ }
      
      const settings = await getAppSettings();
      if (!settings) {
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Settings could not be loaded.', requestId));
      }
      
      const version = packageJson.version;
      
      if (isAuthenticated) {
         // Return full settings for authenticated users
         return res.status(200).json({ settings: { ...settings, version } });
      } else {
         // Return only safe, public settings for unauthenticated users
         const publicSettings = {
            scraper_type: settings.scraper_type || 'none',
            available_scapers: settings.available_scapers || [],
            search_console_integrated: settings.search_console_integrated || false,
            version
         };
         return res.status(200).json({ settings: publicSettings });
      }
   } catch (error) {
      logger.error('Error loading app settings', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to load settings.', requestId, message));
   }
};

const updateSettings = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const { settings } = req.body || {};
   if (!settings) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Settings payload is required.', requestId));
   }
   
   if (!process.env.SECRET) {
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Server configuration error', requestId));
   }
   
   try {
      const normalizedSettings: SettingsType = trimStringProperties(normalizeLegacySettings({ ...settings })) as SettingsType;

      const validationErrors = validateSettingsPayload(normalizedSettings as unknown as Record<string, unknown>);
      if (validationErrors.length > 0) {
         return res.status(400).json(errorResponse('BAD_REQUEST', validationErrors.join(' '), requestId));
      }

      const cryptr = new Cryptr(process.env.SECRET);
      const encrypt = (value?: string) => (value ? cryptr.encrypt(value) : '');

      // The stored settings, so a secret that is left out of the payload keeps its stored (encrypted) value.
      // This also covers adwords_refresh_token, which the Google OAuth callback writes.
      // Read and write under one lock, so a concurrent save (for example the Google Ads callback) is not lost
      await withSettingsLock(async () => {
         let existingSettings: Partial<SettingsType> = {};
         try {
            const existingSettingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
            existingSettings = safeJsonParse<Partial<SettingsType>>(existingSettingsRaw, {}, { context: 'settings.json', logError: false });
         } catch (err) {
            // If file doesn't exist or can't be read, absent secrets are stored as empty
            logger.debug('Could not read existing settings for secrets left out of the payload', { error: err instanceof Error ? err.message : String(err) });
         }

         // A key present in the payload is encrypted (an empty value clears it); an absent key keeps the stored value
         const secretOrStored = (key: keyof SettingsType): string => (key in normalizedSettings
            ? encrypt(normalizedSettings[key] as string)
            : ((existingSettings[key] as string | undefined) ?? ''));

         const securedSettings = {
            ...normalizedSettings,
            scraping_api: secretOrStored('scraping_api'),
            smtp_password: secretOrStored('smtp_password'),
            search_console_client_email: secretOrStored('search_console_client_email'),
            search_console_private_key: secretOrStored('search_console_private_key'),
            adwords_client_id: secretOrStored('adwords_client_id'),
            adwords_client_secret: secretOrStored('adwords_client_secret'),
            adwords_refresh_token: secretOrStored('adwords_refresh_token'),
            adwords_developer_token: secretOrStored('adwords_developer_token'),
            adwords_account_id: secretOrStored('adwords_account_id'),
         };

         await atomicWriteFile(`${process.cwd()}/data/settings.json`, JSON.stringify(securedSettings), 'utf-8');
      });
      return res.status(200).json({ settings: normalizedSettings });
   } catch (error) {
      logger.error('Error updating app settings', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update settings.', requestId, message));
   }
};

export const getAppSettings = async () : Promise<SettingsType> => {
   const settingsPath = `${process.cwd()}/data/settings.json`;
   const failedQueuePath = `${process.cwd()}/data/failed_queue.json`;

   // Initialize failedQueue early to avoid reference errors in early returns
   let failedQueue: number[] = [];
   try {
      failedQueue = await retryQueueManager.peekQueue();
   } catch (failedQueueError) {
      logger.warn('Failed to read failed queue', { error: failedQueueError instanceof Error ? failedQueueError.message : String(failedQueueError) });
      failedQueue = [];
   }

   try {
      const settingsRaw = await readFile(settingsPath, { encoding: 'utf-8' });
      const settings = normalizeLegacySettings(safeJsonParse<Partial<SettingsType>>(settingsRaw, {}, { context: 'settings.json', logError: true }));
      const baseSettings: SettingsType = { ...buildSettingsDefaults(), ...settings };
      let decryptedSettings: SettingsType = baseSettings;

      if (!process.env.SECRET) {
         logger.warn('SECRET environment variable not configured, cannot decrypt settings');
         return {
            ...baseSettings,
            scraping_api: '',
            smtp_password: '',
            search_console_client_email: '',
            search_console_private_key: '',
            adwords_client_id: '',
            adwords_client_secret: '',
            adwords_refresh_token: '',
            adwords_developer_token: '',
            adwords_account_id: '',
            available_scapers: allScrapers.map((scraper) => ({
               label: scraper.name,
               value: scraper.id,
               allowsCity: !!scraper.allowsCity,
               supportsMapPack: !!scraper.supportsMapPack,
               scraperCountries: scraper.scraperCountries,
            })),
            failed_queue: failedQueue,
            search_console_integrated: false,
         };
      }

      try {
         const cryptr = new Cryptr(process.env.SECRET as string);
         const scraping_api = settings.scraping_api ? cryptr.decrypt(settings.scraping_api) : '';
         const smtp_password = settings.smtp_password ? cryptr.decrypt(settings.smtp_password) : '';
         const search_console_client_email = settings.search_console_client_email ? cryptr.decrypt(settings.search_console_client_email) : '';
         const search_console_private_key = settings.search_console_private_key ? cryptr.decrypt(settings.search_console_private_key) : '';
         const adwords_client_id = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
         const adwords_client_secret = settings.adwords_client_secret ? cryptr.decrypt(settings.adwords_client_secret) : '';
         const adwords_refresh_token = settings.adwords_refresh_token ? cryptr.decrypt(settings.adwords_refresh_token) : '';
         const adwords_developer_token = settings.adwords_developer_token ? cryptr.decrypt(settings.adwords_developer_token) : '';
         const adwords_account_id = settings.adwords_account_id ? cryptr.decrypt(settings.adwords_account_id) : '';

         decryptedSettings = {
            ...baseSettings,
            scraping_api,
            smtp_password,
            search_console_client_email,
            search_console_private_key,
            adwords_client_id,
            adwords_client_secret,
            adwords_refresh_token,
            adwords_developer_token,
            adwords_account_id,
         };
      } catch (error) {
         logger.error('Error decrypting settings API keys', error instanceof Error ? error : new Error(String(error)));
         decryptedSettings = {
            ...baseSettings,
            scraping_api: '',
            smtp_password: '',
            search_console_client_email: '',
            search_console_private_key: '',
            adwords_client_id: '',
            adwords_client_secret: '',
            adwords_refresh_token: '',
            adwords_developer_token: '',
            adwords_account_id: '',
         };
      }

      const { platformName } = getBranding();

      const normalizedSettings: SettingsType = {
         ...decryptedSettings,
         notification_email_from_name: decryptedSettings.notification_email_from_name || platformName,
      };

      return {
         ...normalizedSettings,
         search_console_integrated:
            !!(process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL)
            || !!(decryptedSettings.search_console_client_email && decryptedSettings.search_console_private_key),
         available_scapers: allScrapers.map((scraper) => ({
            label: scraper.name,
            value: scraper.id,
            allowsCity: !!scraper.allowsCity,
            supportsMapPack: !!scraper.supportsMapPack,
            scraperCountries: scraper.scraperCountries,
         })),
         failed_queue: failedQueue,
      };
   } catch (error) {
       logger.error('Error getting app settings', error instanceof Error ? error : new Error(String(error)));
       const defaults = { ...buildSettingsDefaults() };
       const shouldCreateFile = async (targetPath: string, data: string) => {
          try {
              
             await access(targetPath);
             return;
          } catch (readError) {
             const err = readError as NodeJS.ErrnoException;
             if (err?.code === 'ENOENT') {
                await atomicWriteFile(targetPath, data, 'utf-8');
             }
          }
       };
       await shouldCreateFile(settingsPath, JSON.stringify(defaults));
       await shouldCreateFile(failedQueuePath, JSON.stringify([]));
      return {
         ...defaults,
         available_scapers: allScrapers.map((scraper) => ({
            label: scraper.name,
            value: scraper.id,
            allowsCity: !!scraper.allowsCity,
            supportsMapPack: !!scraper.supportsMapPack,
            scraperCountries: scraper.scraperCountries,
         })),
         failed_queue: [],
         search_console_integrated: false,
      };
   }
};

export default withApiLogging(handler, {
   name: 'settings',
});
