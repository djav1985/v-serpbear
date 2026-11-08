// Migration: drops settings that were removed from the app from data/settings.json. The global search_console setting
// was removed (Search Console is controlled by credentials only), the white_label_enabled, white_label_logo_file and
// platform_name settings were removed (white-label is controlled only by environment variables), and the global
// notification_email setting was removed (recipients come only from each domain's notification_emails). The list is kept here rather than imported from
// pages/api/settings.ts because migrations run under plain Node. The file is rewritten only when a listed key is present.

const fs = require('fs');
const path = require('path');
const { logger } = require('../migrationLogger');

const REMOVED_SETTINGS_KEYS = ['search_console', 'white_label_enabled', 'white_label_logo_file', 'platform_name', 'notification_email'];

const settingsPath = () => path.join(process.cwd(), 'data', 'settings.json');

// Deletes the removed keys from data/settings.json. Returns the keys that were removed (an empty array when none were
// present, the file is missing, or it is not a JSON object).
const dropRemovedSettingsKeys = () => {
   const filePath = settingsPath();
   let parsed;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
   } catch (_error) {
      return [];
   }
   if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
   }
   const removed = REMOVED_SETTINGS_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(parsed, key));
   if (removed.length === 0) {
      return [];
   }
   removed.forEach((key) => { delete parsed[key]; });
   // Write to a temp file and rename it over settings.json, so a crash or a concurrent reader never sees a partial file
   const tempPath = `${filePath}.${process.pid}.tmp`;
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2), 'utf-8');
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.renameSync(tempPath, filePath);
   return removed;
};

module.exports = {
   up: async function up() {
      const removed = dropRemovedSettingsKeys();
      if (removed.length > 0) {
         logger.info(`[MIGRATION] Removed obsolete keys from data/settings.json: ${removed.join(', ')}.`);
      }
   },

   // Data-only migration: removed settings are not restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] Dropping removed settings keys has no rollback.');
   },
};

module.exports.dropRemovedSettingsKeys = dropRemovedSettingsKeys;
module.exports.REMOVED_SETTINGS_KEYS = REMOVED_SETTINGS_KEYS;
