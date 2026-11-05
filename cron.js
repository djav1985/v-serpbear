 
const path = require('path');
const Cryptr = require('cryptr');
const { promises, watch } = require('fs');
const { Cron } = require('croner');
const dotenv = require('dotenv');

/**
 * Loads the same env files Next.js reads, so the worker sees APIKEY, SECRET and the CRON_* values outside Docker.
 * dotenv never overrides a variable that is already set, so the first file loaded wins: .env.local is loaded
 * before the optional .env. Variables already in the process environment (for example from docker compose)
 * take precedence over both files.
 */
const loadEnvFiles = (dir = process.cwd()) => {
   dotenv.config({ path: path.join(dir, '.env.local') });
   dotenv.config({ path: path.join(dir, '.env') });
};

loadEnvFiles();

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

const DEFAULT_CRON_TIMEZONE = 'America/New_York';
const isValidTimezone = (value) => {
   try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
   } catch {
      return false;
   }
};
const configuredTimezone = normalizeValue(process.env.CRON_TIMEZONE, DEFAULT_CRON_TIMEZONE);
const CRON_TIMEZONE = isValidTimezone(configuredTimezone) ? configuredTimezone : DEFAULT_CRON_TIMEZONE;
const CRON_MAIN_SCHEDULE = normalizeValue(process.env.CRON_MAIN_SCHEDULE, '0 0 0 * * *');
const CRON_EMAIL_SCHEDULE = normalizeValue(process.env.CRON_EMAIL_SCHEDULE, '0 0 6 * * *');
const CRON_FAILED_SCHEDULE = normalizeValue(process.env.CRON_FAILED_SCHEDULE, '0 0 */1 * * *');

/**
 * Cron interval mapping - maps interval keys to cron expressions
 */
const CRON_INTERVAL_MAP = {
   hourly: CRON_FAILED_SCHEDULE,
   daily: CRON_MAIN_SCHEDULE,
   // Odd days of the month (1, 3, ..., 31). Day 31 is included so month ends never leave a 3 day gap;
   // the only irregularity is a back-to-back run on the 31st and the 1st (and 2 days after the 29th/30th).
   other_day: '0 0 0 1-31/2 * *',
   daily_morning: CRON_EMAIL_SCHEDULE,
   weekly: '0 0 0 * * 1',
   monthly: '0 0 0 1 * *', // Run every first day of the month at 00:00 (midnight)
};

/**
 * Replaces the day-of-month and day-of-week fields of a cron expression, keeping its time of day.
 * Accepts 5 or 6 field expressions (a 5 field one gets seconds = 0). Returns null if it cannot be parsed.
 */
const withDayPattern = (expression, dayOfMonth, dayOfWeek) => {
   const parts = expression.trim().split(/\s+/);
   if (parts.length === 5) {
      parts.unshift('0');
   }
   if (parts.length !== 6) {
      return null;
   }
   parts[3] = dayOfMonth;
   parts[5] = dayOfWeek;
   return parts.join(' ');
};

/**
 * Email schedules. Daily emails use CRON_EMAIL_SCHEDULE. Weekly and monthly emails keep that same time of day
 * instead of midnight: the scrape runs at CRON_MAIN_SCHEDULE (midnight by default), so a report sent at the email
 * time sees that day's results, and it no longer starts at the same moment as the scrape.
 */
const NOTIFICATION_SCHEDULE_MAP = {
   daily: CRON_EMAIL_SCHEDULE,
   weekly: withDayPattern(CRON_EMAIL_SCHEDULE, '*', '1') || CRON_EMAIL_SCHEDULE,
   monthly: withDayPattern(CRON_EMAIL_SCHEDULE, '1', '*') || CRON_EMAIL_SCHEDULE,
};

/** Settings file the worker watches for schedule changes, and the debounce applied to its change events */
const SETTINGS_FILE_NAME = 'settings.json';
const SETTINGS_WATCH_DEBOUNCE_MS = 1000;

/** Slow safety re-check of settings (every 30 minutes, at second 0). Covers missed file events and watcher failures. */
const SETTINGS_SAFETY_CHECK_SCHEDULE = '0 */30 * * * *';

const DEFAULT_APP_SETTINGS = {
   scraper_type: 'none',
   notification_interval: 'never',
   notification_email: '',
   smtp_server: '',
   smtp_port: '',
   smtp_username: '',
   smtp_password: '',
   scrape_interval: '',
};

/**
 * Get application settings from data/settings.json
 *
 * Error handling behavior:
 * - ENOENT (file missing): Returns defaults in memory. The cron worker never writes the file, so it cannot
 *   overwrite settings that were just saved by the app.
 * - Invalid JSON / read error: Returns defaults WITHOUT overwriting the file (to preserve recoverable data).
 *   With `{ strict: true }` it throws instead, so the caller can keep the schedule it already applied.
 * - Missing SECRET or decryption failure: Returns parsed settings with empty strings for encrypted fields
 *
 * Note: This differs from pages/api/settings.ts which overwrites the file on ANY read error.
 * The cron worker is more conservative to avoid data loss during automated operations.
 */
const getAppSettings = async ({ strict = false } = {}) => {
   const settingsPath = `${process.cwd()}/data/settings.json`;
   const defaultSettings = { ...DEFAULT_APP_SETTINGS };
   try {
      const settingsRaw = await promises.readFile(settingsPath, { encoding: 'utf-8' });
      // Empty or whitespace-only file: treat as no stored settings. Defaults are returned and the file is left as is.
      if (!settingsRaw || !settingsRaw.trim()) {
         return defaultSettings;
      }
      let settings = {};
      try {
         settings = JSON.parse(settingsRaw);
      } catch (error) {
         logger.error('CRON: Parsing Settings File.', error instanceof Error ? error : new Error(String(error)));
         if (strict) { throw error; }
         return defaultSettings;
      }

      if (!process.env.SECRET) {
         logger.error('CRON: SECRET is not set; cannot decrypt the API keys in settings. Set SECRET in your environment.');
         return { ...settings, scraping_api: '', smtp_password: '' };
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
         return defaultSettings;
      }
      if (strict) { throw error; }
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
            return res.text()
               .catch(() => '')
               .then((text) => {
                  const detail = text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`;
                  throw new Error(detail);
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

/**
 * Registers a cron job. An invalid expression is logged and skipped, so one bad CRON_* value cannot stop
 * the other jobs from being scheduled.
 */
const scheduleJob = (name, expression, task, options) => {
   try {
      return new Cron(expression, task, options);
   } catch (error) {
      logger.error(`CRON: Invalid schedule for ${name}; job not scheduled.`, error instanceof Error ? error : new Error(String(error)), { expression });
      return null;
   }
};

// Keeps each retry request URL well under common header limits.
const RETRY_BATCH_SIZE = 100;

const runAppCronJobs = () => {
   logger.info('CRON: Initializing application cron jobs.', { timezone: CRON_TIMEZONE });
   
   // APP_URL is the internal origin for the worker's own calls and wins when set (the public URL may not be
   // reachable from inside the container). Falls back to NEXT_PUBLIC_APP_URL, then localhost.
   const internalApiUrl = normalizeValue(process.env.APP_URL, '') || normalizeValue(process.env.NEXT_PUBLIC_APP_URL, '') || 'http://localhost:3000';
   
   logger.debug('CRON: Worker configuration.', { url: internalApiUrl, apiKeyConfigured: !!process.env.APIKEY });
   
   // Timezone only: croner has no "scheduled" option, jobs start as soon as they are created
   const cronOptions = { timezone: CRON_TIMEZONE };

   // The scrape and email jobs follow the settings. Settings are re-read when data/settings.json changes (fs.watch,
   // debounced) and every 30 minutes as a safety check. Jobs are rebuilt only when the schedule changed.
   // Runs are chained so two checks never create duplicate jobs.
   let scrapeJob = null;
   let emailJob = null;
   let activePlanKey = null;
   let applyChain = Promise.resolve();

   const applyScheduleFromSettings = async () => {
      let settings;
      try {
         settings = await getAppSettings({ strict: true });
      } catch (error) {
         // Unreadable settings must not tear down jobs that are already running
         logger.error('CRON: Could not read settings; keeping the current schedule.', error instanceof Error ? error : new Error(String(error)));
         if (activePlanKey !== null) {
            return;
         }
         settings = { ...DEFAULT_APP_SETTINGS };
      }
      const scrapeInterval = settings.scrape_interval || 'daily';
      const notifInterval = settings.notification_interval;

      const scrapeCronTime = scrapeInterval !== 'never'
         ? normalizeValue(CRON_INTERVAL_MAP[scrapeInterval] || CRON_MAIN_SCHEDULE, CRON_MAIN_SCHEDULE)
         : null;
      const emailCronTime = notifInterval && notifInterval !== 'never'
         ? normalizeValue(NOTIFICATION_SCHEDULE_MAP[notifInterval] || CRON_EMAIL_SCHEDULE, CRON_EMAIL_SCHEDULE)
         : null;

      const planKey = JSON.stringify([scrapeCronTime, emailCronTime]);
      if (planKey === activePlanKey) {
         return;
      }

      if (scrapeJob) { scrapeJob.stop(); scrapeJob = null; }
      if (emailJob) { emailJob.stop(); emailJob = null; }

      logger.info('CRON: Applying schedule from settings.', { scrapeSchedule: scrapeCronTime, emailSchedule: emailCronTime, type: settings.scraper_type || 'none' });

      if (scrapeCronTime) {
         scrapeJob = scheduleJob('keyword scraping', scrapeCronTime, () => {
            logger.info('CRON: Running Keyword Position Cron Job.');
            makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/cron', 'CRON: Keyword Scraping Result');
         }, cronOptions);
      }

      if (emailCronTime) {
         emailJob = scheduleJob('email notification', emailCronTime, () => {
            logger.info('CRON: Sending Notification Email.');
            makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/notify', 'CRON: Email Notification Result');
         }, cronOptions);
      }

      activePlanKey = planKey;
   };

   const syncScheduleFromSettings = () => {
      applyChain = applyChain
         .then(applyScheduleFromSettings)
         .catch((error) => {
            logger.error('CRON: Could not apply schedule from settings; keeping the current jobs.', error instanceof Error ? error : new Error(String(error)));
         });
      return applyChain;
   };

   syncScheduleFromSettings();
   scheduleJob('settings safety check', SETTINGS_SAFETY_CHECK_SCHEDULE, syncScheduleFromSettings, cronOptions);

   // Watches the data directory rather than the file: settings are saved via temp file + rename, which a
   // file-level watch can miss. Bursts of events are debounced so the sync runs once.
   let settingsDebounce = null;
   const onSettingsDirEvent = (eventType, filename) => {
      if (filename && filename.toString() !== SETTINGS_FILE_NAME) {
         return;
      }
      clearTimeout(settingsDebounce);
      settingsDebounce = setTimeout(() => {
         settingsDebounce = null;
         syncScheduleFromSettings();
      }, SETTINGS_WATCH_DEBOUNCE_MS);
      settingsDebounce.unref();
   };

   try {
      const settingsWatcher = watch(path.join(process.cwd(), 'data'), onSettingsDirEvent);
      settingsWatcher.on('error', (error) => {
         logger.warn('CRON: Settings watcher failed; relying on the 30 minute safety check.', { error: error?.message || String(error) });
         settingsWatcher.close();
      });
      settingsWatcher.unref();
   } catch (error) {
      logger.warn('CRON: Could not watch the settings directory; relying on the 30 minute safety check.', { error: error?.message || String(error) });
   }

   // Run Failed scraping CRON using configured failed queue schedule
   const failedCronTime = normalizeValue(CRON_FAILED_SCHEDULE, '0 0 */1 * * *');
   scheduleJob('failed scrape retry', failedCronTime, async () => {
      logger.info('CRON: Retrying Failed Scrapes.');

      try {
         // Use retryQueueManager for concurrency-safe access
         const keywordsToRetry = await retryQueueManager.peekQueue();

         if (keywordsToRetry.length > 0) {
            logger.info('CRON: Found failed scrapes to retry.', { count: keywordsToRetry.length });
            // Send the IDs in batches so each request URL stays small
            for (let i = 0; i < keywordsToRetry.length; i += RETRY_BATCH_SIZE) {
               const batch = keywordsToRetry.slice(i, i + RETRY_BATCH_SIZE);
               const params = new URLSearchParams({ id: batch.join(',') });
               await makeCronApiCall(process.env.APIKEY, internalApiUrl, `/api/refresh?${params.toString()}`, 'CRON: Failed Scrapes Retry Result');
            }
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
   scheduleJob('search console', searchConsoleCRONTime, () => {
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
   CRON_INTERVAL_MAP,
   normalizeValue,
   loadEnvFiles,
};
