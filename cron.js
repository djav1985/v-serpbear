 
const Cryptr = require('cryptr');
const { promises } = require('fs');
const { readFile } = require('fs');
const { Cron } = require('croner');
require('dotenv').config({ path: './.env.local' });

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

const normalizeCronExpression = (value, fallback) => normalizeValue(value, fallback);

const CRON_TIMEZONE = normalizeValue(process.env.CRON_TIMEZONE, 'America/New_York');
const CRON_MAIN_SCHEDULE = normalizeCronExpression(process.env.CRON_MAIN_SCHEDULE, '0 0 0 * * *');
const CRON_EMAIL_SCHEDULE = normalizeCronExpression(process.env.CRON_EMAIL_SCHEDULE, '0 0 6 * * *');
const CRON_FAILED_SCHEDULE = normalizeCronExpression(process.env.CRON_FAILED_SCHEDULE, '0 0 */1 * * *');

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
         console.error('CRON ERROR: Parsing Settings File.', error);
         return defaultSettings;
      }

      try {
         const cryptr = new Cryptr(process.env.SECRET);
         const scraping_api = settings.scraping_api ? cryptr.decrypt(settings.scraping_api) : '';
         const smtp_password = settings.smtp_password ? cryptr.decrypt(settings.smtp_password) : '';
         return { ...settings, scraping_api, smtp_password };
      } catch (error) {
         console.error('Error Decrypting Settings API Keys!', error);
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
      console.error('CRON ERROR: Reading Settings File.', error);
      return defaultSettings;
   }
};

const generateCronTime = (interval) => {
   let cronTime = false;
   if (interval === 'hourly') {
      cronTime = CRON_FAILED_SCHEDULE;
   }
   if (interval === 'daily') {
      cronTime = CRON_MAIN_SCHEDULE;
   }
   if (interval === 'other_day') {
      cronTime = '0 0 2-30/2 * *';
   }
   if (interval === 'daily_morning') {
      cronTime = CRON_EMAIL_SCHEDULE;
   }
   if (interval === 'weekly') {
      cronTime = '0 0 * * 1';
   }
   if (interval === 'monthly') {
      cronTime = '0 0 1 * *'; // Run every first day of the month at 00:00(midnight)
   }

   return cronTime;
};

const makeCronApiCall = (apiKey, baseUrl, endpoint, successMessage) => {
   if (!apiKey) {
      console.log(`[CRON] Skipping API call to ${endpoint}: API key not configured.`);
      return Promise.resolve();
   }

   const fetchOpts = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } };
   return fetch(`${baseUrl}${endpoint}`, fetchOpts)
      .then((res) => res.json())
      .then((data) => { console.log(successMessage, { data }); })
      .catch((err) => {
         console.error(`[CRON] ERROR making API call to ${endpoint}:`, err);
      });
};

const runAppCronJobs = () => {
   console.log('[CRON] Initializing application cron jobs...');
   console.log('[CRON] Timezone:', { timezone: CRON_TIMEZONE });
   
   // Use internal docker hostname for API calls, fallback to configured URL
   const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
   const internalApiUrl = apiUrl.includes('localhost') ? 'http://localhost:3000' : apiUrl;
   
   console.log('[CRON] API URL:', { url: internalApiUrl });
   console.log('[CRON] API Key available:', { available: !!process.env.APIKEY });
   
   const cronOptions = { scheduled: true, timezone: CRON_TIMEZONE };
   
   // Helper function to make API calls
   getAppSettings().then((settings) => {
      // RUN SERP Scraping CRON using configured schedule
      const scrape_interval = settings.scrape_interval || 'daily';
      console.log('[CRON] Scraper interval:', { interval: scrape_interval });
      console.log('[CRON] Scraper type:', { type: settings.scraper_type || 'none' });
      
      if (scrape_interval !== 'never') {
         const scrapeCronTime = normalizeCronExpression(generateCronTime(scrape_interval) || CRON_MAIN_SCHEDULE, CRON_MAIN_SCHEDULE);
         console.log('[CRON] Setting up keyword scraping cron with schedule:', { schedule: scrapeCronTime });
         new Cron(scrapeCronTime, () => {
            console.log('[CRON] Running Keyword Position Cron Job!');
            makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/cron', '[CRON] Keyword Scraping Result:');
         }, cronOptions);
      }

      // RUN Email Notification CRON
      const notif_interval = (!settings.notification_interval || settings.notification_interval === 'never') ? false : settings.notification_interval;
      if (notif_interval) {
         const cronTime = normalizeCronExpression(
            generateCronTime(notif_interval === 'daily' ? 'daily_morning' : notif_interval) || CRON_EMAIL_SCHEDULE,
            CRON_EMAIL_SCHEDULE,
         );
         if (cronTime) {
            new Cron(cronTime, () => {
               console.log('[CRON] Sending Notification Email...');
               makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/notify', '[CRON] Email Notification Result:');
            }, cronOptions);
         }
      }
   });

   // Run Failed scraping CRON using configured failed queue schedule
   const failedCronTime = normalizeCronExpression(CRON_FAILED_SCHEDULE, '0 0 */1 * * *');
   new Cron(failedCronTime, () => {
      console.log('[CRON] Retrying Failed Scrapes...');

      readFile(`${process.cwd()}/data/failed_queue.json`, { encoding: 'utf-8' }, (err, data) => {
         if (data) {
            try {
               const keywordsToRetry = data ? JSON.parse(data) : [];
               if (keywordsToRetry.length > 0) {
                  console.log(`[CRON] Found ${keywordsToRetry.length} failed scrapes to retry`, { count: keywordsToRetry.length });
                  // Use URLSearchParams to safely encode the keyword IDs
                  const params = new URLSearchParams({ id: keywordsToRetry.join(',') });
                  makeCronApiCall(process.env.APIKEY, internalApiUrl, `/api/refresh?${params.toString()}`, '[CRON] Failed Scrapes Retry Result:');
               } else {
                  console.log('[CRON] No failed scrapes to retry');
               }
            } catch (error) {
               console.error('[CRON] ERROR Reading Failed Scrapes Queue File:', error);
            }
         } else {
            console.error('[CRON] ERROR Reading Failed Scrapes Queue File:', err);
         }
      });
   }, cronOptions);

   // Run Google Search Console Scraper on configured main schedule
   // Always run the CRON as the API endpoint will check for credentials per domain
   const searchConsoleCRONTime = normalizeCronExpression(CRON_MAIN_SCHEDULE, '0 0 0 * * *');
   new Cron(searchConsoleCRONTime, () => {
      console.log('[CRON] Running Google Search Console Scraper...');
      makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/searchconsole', '[CRON] Search Console Scraper Result:');
   }, cronOptions);
   
   console.log('[CRON] All cron jobs initialized successfully');
};

if (require.main === module) {
   runAppCronJobs();
   console.log('[CRON] Cron worker started');
}

module.exports = {
   runAppCronJobs,
   makeCronApiCall,
   getAppSettings,
   normalizeCronExpression,
};
