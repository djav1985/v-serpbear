/* eslint-disable no-new */
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

const getAppSettings = async () => {
   const defaultSettings = {
      scraper_type: 'none',
      notification_interval: 'never',
      notification_email: '',
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: ''
   };
   // console.log('process.env.SECRET: ', process.env.SECRET);
   try {
      let decryptedSettings = {};
      const exists = await promises.stat(`${process.cwd()}/data/settings.json`).then(() => true).catch(() => false);
      if (exists) {
         const settingsRaw = await promises.readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
         const settings = settingsRaw ? JSON.parse(settingsRaw) : {};

         try {
            const cryptr = new Cryptr(process.env.SECRET);
            const scraping_api = settings.scraping_api ? cryptr.decrypt(settings.scraping_api) : '';
            const smtp_password = settings.smtp_password ? cryptr.decrypt(settings.smtp_password) : '';
            decryptedSettings = { ...settings, scraping_api, smtp_password };
         } catch (error) {
            console.log('Error Decrypting Settings API Keys!');
         }
      } else {
         throw Error('Settings file dont exist.');
      }
      return decryptedSettings;
   } catch (error) {
      // console.log('CRON ERROR: Reading Settings File. ', error);
      await promises.writeFile(`${process.cwd()}/data/settings.json`, JSON.stringify(defaultSettings), { encoding: 'utf-8' });
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

const runAppCronJobs = () => {
   console.log('[CRON] Initializing application cron jobs...');
   console.log('[CRON] Timezone:', CRON_TIMEZONE);
   
   // Use internal docker hostname for API calls, fallback to configured URL
   const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
   const internalApiUrl = apiUrl.includes('localhost') ? 'http://localhost:3000' : apiUrl;
   
   console.log('[CRON] API URL:', internalApiUrl);
   console.log('[CRON] API Key available:', !!process.env.APIKEY);
   
   const cronOptions = { scheduled: true, timezone: CRON_TIMEZONE };
   
   // Helper function to make API calls
   const makeApiCall = (endpoint, successMessage) => {
      const fetchOpts = { method: 'POST', headers: { Authorization: `Bearer ${process.env.APIKEY}` } };
      return fetch(`${internalApiUrl}${endpoint}`, fetchOpts)
         .then((res) => res.json())
         .then((data) => { console.log(successMessage, data); })
         .catch((err) => {
            console.log(`[CRON] ERROR making API call to ${endpoint}:`, err.message || err);
         });
   };
   
   getAppSettings().then((settings) => {
      // RUN SERP Scraping CRON using configured schedule
      const scrape_interval = settings.scrape_interval || 'daily';
      console.log('[CRON] Scraper interval:', scrape_interval);
      console.log('[CRON] Scraper type:', settings.scraper_type || 'none');
      
      if (scrape_interval !== 'never') {
         const scrapeCronTime = normalizeCronExpression(generateCronTime(scrape_interval) || CRON_MAIN_SCHEDULE, CRON_MAIN_SCHEDULE);
         console.log('[CRON] Setting up keyword scraping cron with schedule:', scrapeCronTime);
         new Cron(scrapeCronTime, () => {
            console.log('[CRON] Running Keyword Position Cron Job!');
            makeApiCall('/api/cron', '[CRON] Keyword Scraping Result:');
         }, cronOptions);
      }

      // RUN Email Notification CRON
      const notif_interval = (!settings.notification_interval || settings.notification_interval === 'never') ? false : settings.notification_interval;
      if (notif_interval) {
         const cronTime = normalizeCronExpression(
            generateCronTime(notif_interval === 'daily' ? 'daily_morning' : notif_interval) || CRON_EMAIL_SCHEDULE,
            CRON_EMAIL_SCHEDULE
         );
         if (cronTime) {
            new Cron(cronTime, () => {
               console.log('[CRON] Sending Notification Email...');
               makeApiCall('/api/notify', '[CRON] Email Notification Result:');
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
                  console.log(`[CRON] Found ${keywordsToRetry.length} failed scrapes to retry`);
                  makeApiCall(`/api/refresh?id=${keywordsToRetry.join(',')}`, '[CRON] Failed Scrapes Retry Result:');
               } else {
                  console.log('[CRON] No failed scrapes to retry');
               }
            } catch (error) {
               console.log('[CRON] ERROR Reading Failed Scrapes Queue File:', error.message || error);
            }
         } else {
            console.log('[CRON] ERROR Reading Failed Scrapes Queue File:', err?.message || err);
         }
      });
   }, cronOptions);

   // Run Google Search Console Scraper on configured main schedule
   // Always run the CRON as the API endpoint will check for credentials per domain
   const searchConsoleCRONTime = normalizeCronExpression(CRON_MAIN_SCHEDULE, '0 0 0 * * *');
   new Cron(searchConsoleCRONTime, () => {
      console.log('[CRON] Running Google Search Console Scraper...');
      makeApiCall('/api/searchconsole', '[CRON] Search Console Scraper Result:');
   }, cronOptions);
   
   console.log('[CRON] All cron jobs initialized successfully');
};

runAppCronJobs();
console.log('[CRON] Cron worker started');
