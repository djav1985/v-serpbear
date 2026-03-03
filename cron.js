 
const Cryptr = require('cryptr');
const { promises } = require('fs');
const { Cron } = require('croner');
require('dotenv').config({ path: './.env.local' });

// Import logger after dotenv so LOG_LEVEL env var is available at Logger construction time
const { logger } = require('./utils/logger');

// Load retryQueueManager synchronously at startup (safe for cron worker)
const { retryQueueManager } = require('./utils/retryQueueManager');

const stripOptionalQuotes = (value) => {
   if (typeof value !== 'string') {
      return value;
   }

   return value.replace(/^['"]+/, '').replace(/['"]+$/, '');
};

const normalizeValue = (value, fallback) => {
   if (value === undefined || value === null) {
      return fallback;
   }

   if (typeof value !== 'string' && !value) {
      return fallback;
   }

   const trimmed = value.toString().trim();
   if (!trimmed) {
      return fallback;
   }

   const sanitized = stripOptionalQuotes(trimmed).trim();
   return sanitized || fallback;
};

const CRON_TIMEZONE = normalizeValue(process.env.CRON_TIMEZONE, 'America/New_York');
const CRON_MAIN_SCHEDULE = normalizeValue(process.env.CRON_MAIN_SCHEDULE, '0 0 0 * * *');
const CRON_EMAIL_SCHEDULE = normalizeValue(process.env.CRON_EMAIL_SCHEDULE, '0 0 6 * * *');
const CRON_FAILED_SCHEDULE = normalizeValue(process.env.CRON_FAILED_SCHEDULE, '0 0 */1 * * *');

/**
 * Cron interval mapping - maps interval keys to cron expressions
 */
const CRON_INTERVAL_MAP = {
   hourly: CRON_FAILED_SCHEDULE,
   daily: CRON_MAIN_SCHEDULE,
   other_day: '0 0 0 2-30/2 * *',
   daily_morning: CRON_EMAIL_SCHEDULE,
   weekly: '0 0 0 * * 1',
   monthly: '0 0 0 1 * *', // Run every first day of the month at 00:00 (midnight)
};

/**
 * Get application settings from data/settings.json
 * 
 * Error handling behavior:
 * - ENOENT (file missing): Creates file with defaults and returns defaults
 * - Invalid JSON: Returns defaults WITHOUT overwriting the file (to preserve recoverable data)
 * - Decryption failure: Returns parsed settings with empty strings for encrypted fields
 * 
 * Note: This differs from pages/api/settings.ts which overwrites the file on ANY read error.
 * The cron worker is more conservative to avoid data loss during automated operations.
 */
const getAppSettings = async () => {
   const settingsPath = `${process.cwd()}/data/settings.json`;
   const defaultSettings = {
      scraper_type: 'none',
      notification_interval: 'never',
      notification_email: '',
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: '',
      scrape_interval: '',
   };
   // console.log('process.env.SECRET: ', process.env.SECRET);
   try {
      const settingsRaw = await promises.readFile(settingsPath, { encoding: 'utf-8' });
      let settings = {};
      try {
         settings = settingsRaw ? JSON.parse(settingsRaw) : {};
      } catch (error) {
         logger.error('CRON: Parsing Settings File.', error instanceof Error ? error : new Error(String(error)));
         return defaultSettings;
      }

      try {
         const cryptr = new Cryptr(process.env.SECRET);
         const scraping_api = settings.scraping_api ? cryptr.decrypt(settings.scraping_api) : '';
         const smtp_password = settings.smtp_password ? cryptr.decrypt(settings.smtp_password) : '';
         return { ...settings, scraping_api, smtp_password };
      } catch (error) {
         logger.error('CRON: Error Decrypting Settings API Keys.', error instanceof Error ? error : new Error(String(error)));
         return {
            ...settings,
            scraping_api: '',
            smtp_password: ''
         };
      }
   } catch (error) {
      if (error?.code === 'ENOENT') {
         await promises.writeFile(settingsPath, JSON.stringify(defaultSettings), { encoding: 'utf-8' });
         return defaultSettings;
      }
      logger.error('CRON: Reading Settings File.', error instanceof Error ? error : new Error(String(error)));
      return defaultSettings;
   }
};

const makeCronApiCall = (apiKey, baseUrl, endpoint, successMessage) => {
   if (!apiKey) {
      logger.warn('CRON: Skipping API call, API key not configured.', { endpoint });
      return Promise.resolve();
   }

   const fetchOpts = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } };
   return fetch(`${baseUrl}${endpoint}`, fetchOpts)
      .then((res) => {
         if (!res.ok) {
            logger.error(`CRON: API call failed.`, new Error(`HTTP ${res.status}`), { endpoint, status: res.status });
            return res.text().then(text => {
               throw new Error(`HTTP ${res.status}: ${text || 'No response body'}`);
            }).catch(() => {
               throw new Error(`HTTP ${res.status}`);
            });
         }
         
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            return res.json().then(data => {
               logger.info(successMessage, { endpoint, status: res.status, data });
            });
         } else {
            // Non-JSON response or empty body
            return res.text().then(text => {
               if (text) {
                  logger.info(successMessage, { endpoint, status: res.status, response: text });
               } else {
                  logger.info(successMessage, { endpoint, status: res.status });
               }
            });
         }
      })
      .catch((err) => {
         logger.error('CRON: Error making API call.', err instanceof Error ? err : new Error(String(err)), { endpoint });
      });
};

const runAppCronJobs = () => {
   logger.info('CRON: Initializing application cron jobs.', { timezone: CRON_TIMEZONE });
   
   // Prefer configured URL, fallback to localhost
   const internalApiUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
   
   logger.debug('CRON: Worker configuration.', { url: internalApiUrl, apiKeyConfigured: !!process.env.APIKEY });
   
   const cronOptions = { scheduled: true, timezone: CRON_TIMEZONE };
   
   // Helper function to make API calls
   getAppSettings().then((settings) => {
      // RUN SERP Scraping CRON using configured schedule
      const scrape_interval = settings.scrape_interval || 'daily';
      logger.info('CRON: Scraper configuration.', { interval: scrape_interval, type: settings.scraper_type || 'none' });
      
      if (scrape_interval !== 'never') {
         const scrapeCronTime = normalizeValue(CRON_INTERVAL_MAP[scrape_interval] || CRON_MAIN_SCHEDULE, CRON_MAIN_SCHEDULE);
         logger.info('CRON: Setting up keyword scraping cron.', { schedule: scrapeCronTime });
         new Cron(scrapeCronTime, () => {
            logger.info('CRON: Running Keyword Position Cron Job.');
            makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/cron', 'CRON: Keyword Scraping Result');
         }, cronOptions);
      }

      // RUN Email Notification CRON
      const notif_interval = (!settings.notification_interval || settings.notification_interval === 'never') ? false : settings.notification_interval;
      if (notif_interval) {
         const intervalKey = notif_interval === 'daily' ? 'daily_morning' : notif_interval;
         const cronTime = normalizeValue(
            CRON_INTERVAL_MAP[intervalKey] || CRON_EMAIL_SCHEDULE,
            CRON_EMAIL_SCHEDULE,
         );
         if (cronTime) {
            new Cron(cronTime, () => {
               logger.info('CRON: Sending Notification Email.');
               makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/notify', 'CRON: Email Notification Result');
            }, cronOptions);
         }
      }
   });

   // Run Failed scraping CRON using configured failed queue schedule
   const failedCronTime = normalizeValue(CRON_FAILED_SCHEDULE, '0 0 */1 * * *');
   new Cron(failedCronTime, async () => {
      logger.info('CRON: Retrying Failed Scrapes.');

      try {
         // Use retryQueueManager for concurrency-safe access
         const keywordsToRetry = await retryQueueManager.getQueue();
         
         if (keywordsToRetry.length > 0) {
            logger.info('CRON: Found failed scrapes to retry.', { count: keywordsToRetry.length });
            // Use URLSearchParams to safely encode the keyword IDs
            const params = new URLSearchParams({ id: keywordsToRetry.join(',') });
            makeCronApiCall(process.env.APIKEY, internalApiUrl, `/api/refresh?${params.toString()}`, 'CRON: Failed Scrapes Retry Result');
         } else {
            logger.debug('CRON: No failed scrapes to retry.');
         }
      } catch (error) {
         logger.error('CRON: Error in Failed Scrapes Retry.', error instanceof Error ? error : new Error(String(error)));
      }
   }, cronOptions);

   // Run Google Search Console Scraper on configured main schedule
   // Always run the CRON as the API endpoint will check for credentials per domain
   const searchConsoleCRONTime = normalizeValue(CRON_MAIN_SCHEDULE, '0 0 0 * * *');
   new Cron(searchConsoleCRONTime, () => {
      logger.info('CRON: Running Google Search Console Scraper.');
      makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/searchconsole', 'CRON: Search Console Scraper Result');
   }, cronOptions);
   
   logger.info('CRON: All cron jobs initialized successfully.');
};

if (require.main === module) {
   runAppCronJobs();
   logger.info('CRON: Cron worker started.');
}

module.exports = {
   runAppCronJobs,
   makeCronApiCall,
   getAppSettings,
   normalizeValue,
};
