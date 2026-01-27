/// <reference path="../../types.d.ts" />

import { writeFile, readFile, access } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import { logger } from '../../utils/logger';
import verifyUser from '../../utils/verifyUser';
import allScrapers from '../../scrapers/index';
import { withApiLogging } from '../../utils/apiLogging';
import { trimStringProperties } from '../../utils/security';
import { getBranding } from '../../utils/branding';
import packageJson from '../../package.json';
import { safeJsonParse } from '../../utils/safeJsonParse';

const buildSettingsDefaults = (): SettingsType => {
   const { platformName } = getBranding();
   return {
      scraper_type: 'none',
      scraping_api: '',
      proxy: '',
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

type SettingsGetResponse = {
   settings?: object | null,
   error?: string,
   details?: string,
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   // Allow GET requests without authentication for public settings
   if (req.method === 'GET') {
      return getSettings(req, res);
   }
   
   // All other methods require authentication
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   
   if (req.method === 'PUT') {
      return updateSettings(req, res);
   }
   return res.status(405).json({ error: 'Method not allowed' });
};

const getSettings = async (req: NextApiRequest, res: NextApiResponse<SettingsGetResponse>) => {
   try {
      // Check authentication status
      const authorized = verifyUser(req, res);
      const isAuthenticated = authorized === 'authorized';
      
      const settings = await getAppSettings();
      if (!settings) {
         return res.status(500).json({ error: 'Settings could not be loaded.' });
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
      return res.status(500).json({ error: 'Failed to load settings.', details: message });
   }
};

const updateSettings = async (req: NextApiRequest, res: NextApiResponse<SettingsGetResponse>) => {
   const { settings } = req.body || {};
   // console.log('### settings: ', settings);
   if (!settings) {
      return res.status(400).json({ error: 'Settings payload is required.' });
   }
   try {
      const normalizedSettings: SettingsType = trimStringProperties({ ...settings });

      const cryptr = new Cryptr(process.env.SECRET as string);
      const encrypt = (value?: string) => (value ? cryptr.encrypt(value) : '');
      const scraping_api = encrypt(normalizedSettings.scraping_api);
      const smtp_password = encrypt(normalizedSettings.smtp_password);
      const search_console_client_email = encrypt(normalizedSettings.search_console_client_email);
      const search_console_private_key = encrypt(normalizedSettings.search_console_private_key);
      const adwords_client_id = encrypt(normalizedSettings.adwords_client_id);
      const adwords_client_secret = encrypt(normalizedSettings.adwords_client_secret);
      const adwords_developer_token = encrypt(normalizedSettings.adwords_developer_token);
      const adwords_account_id = encrypt(normalizedSettings.adwords_account_id);

      const securedSettings = {
         ...normalizedSettings,
         scraping_api,
         smtp_password,
         search_console_client_email,
         search_console_private_key,
         adwords_client_id,
         adwords_client_secret,
         adwords_developer_token,
         adwords_account_id,
      };

      await writeFile(`${process.cwd()}/data/settings.json`, JSON.stringify(securedSettings), { encoding: 'utf-8' });
      return res.status(200).json({ settings: normalizedSettings });
   } catch (error) {
      logger.error('Error updating app settings', error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to update settings.', details: message });
   }
};

export const getAppSettings = async () : Promise<SettingsType> => {
   const settingsPath = `${process.cwd()}/data/settings.json`;
   const failedQueuePath = `${process.cwd()}/data/failed_queue.json`;

   try {
      const settingsRaw = await readFile(settingsPath, { encoding: 'utf-8' });
      const settings = safeJsonParse<Partial<SettingsType>>(settingsRaw, {}, { context: 'settings.json', logError: true });
      const baseSettings: SettingsType = { ...buildSettingsDefaults(), ...settings };
      let decryptedSettings: SettingsType = baseSettings;

      try {
         const cryptr = new Cryptr(process.env.SECRET as string);
         const scraping_api = settings.scraping_api ? cryptr.decrypt(settings.scraping_api) : '';
         const smtp_password = settings.smtp_password ? cryptr.decrypt(settings.smtp_password) : '';
         const search_console_client_email = settings.search_console_client_email ? cryptr.decrypt(settings.search_console_client_email) : '';
         const search_console_private_key = settings.search_console_private_key ? cryptr.decrypt(settings.search_console_private_key) : '';
         const adwords_client_id = settings.adwords_client_id ? cryptr.decrypt(settings.adwords_client_id) : '';
         const adwords_client_secret = settings.adwords_client_secret ? cryptr.decrypt(settings.adwords_client_secret) : '';
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
            adwords_developer_token,
            adwords_account_id,
         };
      } catch (error) {
         logger.error('Error decrypting settings API keys', error instanceof Error ? error : new Error(String(error)));
      }

      const { platformName } = getBranding();

      const normalizedSettings: SettingsType = {
         ...decryptedSettings,
         notification_email_from_name: decryptedSettings.notification_email_from_name || platformName,
      };

      let failedQueue: string[] = [];
       try {
          const failedQueueRaw = await readFile(failedQueuePath, { encoding: 'utf-8' });
          failedQueue = safeJsonParse<string[]>(
             failedQueueRaw,
             [],
             { context: 'failed_queue.json', logError: true },
          );
       } catch (failedQueueError) {
         const err = failedQueueError as NodeJS.ErrnoException;
         logger.warn('Failed to read failed queue file, recreating', { error: err?.message || String(err) });
         try {
            await writeFile(failedQueuePath, JSON.stringify([]), { encoding: 'utf-8' });
         } catch (writeError) {
            logger.error('Failed to recreate failed queue file', writeError instanceof Error ? writeError : new Error(String(writeError)));
         }
         failedQueue = [];
      }

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
                // eslint-disable-next-line security/detect-non-literal-fs-filename
                await writeFile(targetPath, data, { encoding: 'utf-8' });
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
   logBody: false,
});
