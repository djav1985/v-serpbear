import allScrapers from '../scrapers/index';
import { NOTIFICATION_INTERVALS } from './constants';

/**
 * Fields that GET adds on top of the stored settings (the app version and timezone, and values computed or read
 * from other stores). A save never writes them, so a client that echoes a GET response cannot store them.
 */
export const DERIVED_SETTINGS_FIELDS = ['version', 'timezone', 'branding', 'available_scapers', 'search_console_integrated', 'failed_queue'] as const;

/**
 * Removed settings keys (REMOVED_SETTINGS_KEYS in utils/settingsFile) are never returned by GET, never kept by a save,
 * and deleted from an existing file by migration 1781000000000-drop-removed-settings-keys. A PUT that still sends one is ignored, not rejected.
 */

/** Fields stored encrypted. A key present in a save is encrypted (an empty value clears it); an absent key keeps the stored value. */
export const SECRET_SETTINGS_FIELDS = [
   'scraping_api',
   'smtp_password',
   'search_console_client_email',
   'search_console_private_key',
   'adwords_client_id',
   'adwords_client_secret',
   'adwords_refresh_token',
   'adwords_developer_token',
   'adwords_account_id',
] as const;

/** Every key a save may store (SettingsType minus the derived fields). Anything else in a payload is ignored. */
export const PERSISTED_SETTINGS_FIELDS = [
   'scraper_type',
   'notification_interval',
   'notification_email_from',
   'notification_email_from_name',
   'smtp_server',
   'smtp_port',
   'smtp_tls_servername',
   'smtp_username',
   'scrape_interval',
   'scrape_delay',
   'scrape_retry',
   'scrape_strategy',
   'scrape_pagination_limit',
   'keywordsColumns',
   ...SECRET_SETTINGS_FIELDS,
] as const;

const SCRAPE_STRATEGIES = ['basic', 'custom'];
const MAX_PAGINATION_LIMIT = 10;
const BOOLEAN_SETTINGS = ['scrape_retry'];

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
      errors.push('scrape_strategy must be basic or custom.');
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
   if (has('keywordsColumns') && (!Array.isArray(settings.keywordsColumns) || !settings.keywordsColumns.every((column) => typeof column === 'string'))) {
      errors.push('keywordsColumns must be a list of column names.');
   }

   return errors;
};

