 
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

const DEFAULT_TZ = 'America/New_York';
const isValidTimezone = (value) => {
   try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
   } catch {
      return false;
   }
};
const configuredTimezone = normalizeValue(process.env.TZ, DEFAULT_TZ);
const TZ_NAME = isValidTimezone(configuredTimezone) ? configuredTimezone : DEFAULT_TZ;
/**
 * CRON_MAIN_SCHEDULE and CRON_EMAIL_SCHEDULE are times of day ("HH:MM", 24 hour, in TZ). The interval
 * settings decide on which days a job runs at that time. A value that is not a valid time (for example an old
 * cron expression) is logged and replaced by the default.
 */
const parseTimeOfDay = (name, value, fallback) => {
   const normalized = normalizeValue(value, fallback);
   const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(normalized);
   if (!match) {
      logger.warn(`CRON: ${name} must be a time like 06:30 (HH:MM, 24 hour); using ${fallback}.`, { value: normalized });
      return parseTimeOfDay(name, fallback, fallback);
   }
   return { hour: Number(match[1]), minute: Number(match[2]) };
};

/** Builds a cron expression that fires at a time of day on the given days of the month and week */
const cronAt = ({ hour, minute }, dayOfMonth = '*', dayOfWeek = '*') => `0 ${minute} ${hour} ${dayOfMonth} * ${dayOfWeek}`;

const MAIN_TIME = parseTimeOfDay('CRON_MAIN_SCHEDULE', process.env.CRON_MAIN_SCHEDULE, '00:00');
const EMAIL_TIME = parseTimeOfDay('CRON_EMAIL_SCHEDULE', process.env.CRON_EMAIL_SCHEDULE, '06:00');
/** CRON_VOLUME_SCHEDULE: time of day of the weekly keyword volume refresh, which runs on Mondays */
const VOLUME_TIME = parseTimeOfDay('CRON_VOLUME_SCHEDULE', process.env.CRON_VOLUME_SCHEDULE, '03:00');

/** CRON_FAILED_SCHEDULE: how often failed scrapes are retried: hourly, daily (at CRON_MAIN_SCHEDULE) or never */
const FAILED_MODES = ['hourly', 'daily', 'never'];
const configuredFailedMode = normalizeValue(process.env.CRON_FAILED_SCHEDULE, 'hourly').toLowerCase();
const FAILED_MODE = FAILED_MODES.includes(configuredFailedMode) ? configuredFailedMode : 'hourly';
if (FAILED_MODE !== configuredFailedMode) {
   logger.warn('CRON: CRON_FAILED_SCHEDULE must be hourly, daily or never; using hourly.', { value: configuredFailedMode });
}

const HOURLY_SCHEDULE = '0 0 * * * *';

/**
 * Scrape schedules, all at the CRON_MAIN_SCHEDULE time of day.
 * other_day: odd days of the month (1, 3, ..., 31). Day 31 is included so month ends never leave a 3 day gap;
 * the only irregularity is a back-to-back run on the 31st and the 1st (and 2 days after the 29th/30th).
 */
const CRON_INTERVAL_MAP = {
   daily: cronAt(MAIN_TIME),
   other_day: cronAt(MAIN_TIME, '1-31/2'),
   weekly: cronAt(MAIN_TIME, '*', '1'),
   monthly: cronAt(MAIN_TIME, '1', '*'),
};

/**
 * Email schedules, all at the CRON_EMAIL_SCHEDULE time of day. It is later than the scrape time so a report sent
 * on a weekly or monthly day sees that day's results.
 */
const NOTIFICATION_SCHEDULE_MAP = {
   daily: cronAt(EMAIL_TIME),
   weekly: cronAt(EMAIL_TIME, '*', '1'),
   monthly: cronAt(EMAIL_TIME, '1', '*'),
};

/** Settings file the worker watches for schedule changes, and the debounce applied to its change events */
const SETTINGS_FILE_NAME = 'settings.json';
const SETTINGS_WATCH_DEBOUNCE_MS = 1000;

/** Slow safety re-check of settings (every 30 minutes, at second 0). Covers missed file events and watcher failures. */
const SETTINGS_SAFETY_CHECK_SCHEDULE = '0 */30 * * * *';

const DEFAULT_APP_SETTINGS = {
   scraper_type: 'none',
   notification_interval: 'never',
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

const makeCronApiCall = (apiKey, baseUrl, endpoint, successMessage, body) => {
   if (!apiKey) {
      logger.warn('CRON: Skipping API call, API key not configured.', { endpoint });
      return Promise.resolve();
   }

   const fetchOpts = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } };
   // An optional JSON body, for endpoints that take one (the volume refresh sends { domain: 'all' })
   if (body !== undefined) {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
   }
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
   logger.info('CRON: Initializing application cron jobs.', { timezone: TZ_NAME });
   
   // APP_URL is the internal origin for the worker's own calls and wins when set (the public URL may not be
   // reachable from inside the container). Falls back to NEXT_PUBLIC_APP_URL, then localhost.
   const internalApiUrl = normalizeValue(process.env.APP_URL, '') || normalizeValue(process.env.NEXT_PUBLIC_APP_URL, '') || 'http://localhost:3000';
   
   logger.debug('CRON: Worker configuration.', { url: internalApiUrl, apiKeyConfigured: !!process.env.APIKEY });
   
   // Timezone only: croner has no "scheduled" option, jobs start as soon as they are created
   const cronOptions = { timezone: TZ_NAME };

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
         ? CRON_INTERVAL_MAP[scrapeInterval] || CRON_INTERVAL_MAP.daily
         : null;
      const emailCronTime = notifInterval && notifInterval !== 'never'
         ? NOTIFICATION_SCHEDULE_MAP[notifInterval] || NOTIFICATION_SCHEDULE_MAP.daily
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
         emailJob = scheduleJob('email notification', emailCronTime, async () => {
            // Same check as /api/notify: without an SMTP host the API answers 400, so skip quietly instead
            const smtpSettings = await getAppSettings();
            if (!normalizeValue(smtpSettings.smtp_server, '')) {
               logger.debug('CRON: SMTP is not configured; skipping the notification email.');
               return;
            }
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

   // Retry failed scrapes hourly or daily (CRON_FAILED_SCHEDULE); "never" schedules no retry job
   const failedCronTime = FAILED_MODE === 'daily' ? CRON_INTERVAL_MAP.daily : HOURLY_SCHEDULE;
   if (FAILED_MODE !== 'never') scheduleJob('failed scrape retry', failedCronTime, async () => {
      try {
         // Auto Retry is opt-in: skip the whole run unless scrape_retry is enabled in settings
         const settings = await getAppSettings();
         if (!settings.scrape_retry) {
            logger.debug('CRON: Auto Retry is disabled; skipping failed scrape retry.');
            return;
         }

         logger.info('CRON: Retrying Failed Scrapes.');
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
   const searchConsoleCRONTime = CRON_INTERVAL_MAP.daily;
   scheduleJob('search console', searchConsoleCRONTime, () => {
      logger.info('CRON: Running Google Search Console Scraper.');
      makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/searchconsole', 'CRON: Search Console Scraper Result');
   }, cronOptions);
   
   // Weekly keyword volume refresh, every Monday at CRON_VOLUME_SCHEDULE. It makes the same request as the
   // Update Keyword Volume Data button in Settings: all keywords, one country at a time across all domains.
   scheduleJob('keyword volume', cronAt(VOLUME_TIME, '*', '1'), () => {
      logger.info('CRON: Running Keyword Volume Update.');
      makeCronApiCall(process.env.APIKEY, internalApiUrl, '/api/volume', 'CRON: Keyword Volume Update Result', { domain: 'all' });
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
   NOTIFICATION_SCHEDULE_MAP,
   normalizeValue,
   loadEnvFiles,
};
