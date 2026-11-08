/// <reference path="../types.d.ts" />

import { access } from 'fs/promises';
import Cryptr from 'cryptr';
import { logger } from './logger';
import { buildAvailableScrapers } from './availableScrapers';
import { getBranding } from './branding';
import { atomicWriteFile } from './atomicWrite';
import { readSettingsFile, withoutRemovedSettingsKeys } from './settingsFile';
import { retryQueueManager } from './retryQueueManager';
import { normalizeLegacyGlobalScraperType } from './removedScrapers';

// The app's settings as the rest of the code reads them: stored in data/settings.json (secrets encrypted with SECRET),
// decrypted here, with defaults and the derived fields added. Shared by the settings endpoint, the other API routes,
// the refresh pipeline and the server-rendered pages.

export const buildSettingsDefaults = (): SettingsType => {
   const { platformName } = getBranding();
   return {
      scraper_type: 'none',
      scraping_api: '',
      notification_interval: 'never',
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


export const normalizeLegacySettings = (settings: Partial<SettingsType>): Partial<SettingsType> => {
   const normalizedSettings = { ...settings } as Partial<SettingsType> & { proxy?: string };

   if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'scraper_type')) {
      normalizedSettings.scraper_type = normalizeLegacyGlobalScraperType(normalizedSettings.scraper_type);
   }

   if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'proxy')) {
      delete normalizedSettings.proxy;
   }

   return normalizedSettings;
};

/** Reads data/settings.json as stored (secrets still encrypted), upgrading legacy field names and dropping removed keys. */
export const readStoredSettingsFile = async (settingsPath: string): Promise<Partial<SettingsType>> => (
   withoutRemovedSettingsKeys(normalizeLegacySettings(await readSettingsFile(settingsPath)))
);

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
      const settings = await readStoredSettingsFile(settingsPath);
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
            available_scapers: buildAvailableScrapers(),
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
         available_scapers: buildAvailableScrapers(),
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
         available_scapers: buildAvailableScrapers(),
         failed_queue: [],
         search_console_integrated: false,
      };
   }
};
