// Migration: the "smart" scrape strategy was removed. Domains set to smart now use "basic" (page 1 only), and so does a
// global scrape_strategy of smart in data/settings.json. The scrape_smart_full_fallback column is left in place, unused.

const fs = require('fs');
const path = require('path');
const { logger } = require('../migrationLogger');

const settingsPath = () => path.join(process.cwd(), 'data', 'settings.json');

// Rewrites data/settings.json only when its scrape_strategy is "smart". Returns true when the file was changed.
const replaceGlobalSmartStrategy = () => {
   const filePath = settingsPath();
   let parsed;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
   } catch (_error) {
      return false;
   }
   if (!parsed || parsed.scrape_strategy !== 'smart') {
      return false;
   }
   parsed.scrape_strategy = 'basic';
   // Write to a temp file and rename it over settings.json, so a crash or a concurrent reader never sees a partial file
   const tempPath = `${filePath}.${process.pid}.tmp`;
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2), 'utf-8');
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.renameSync(tempPath, filePath);
   return true;
};

module.exports = {
   /** @param {import('./migrationTypes').MigrationParams} [params={}] */
   up: async function up(params = {}) {
      const queryInterface = /** @type {import('./migrationTypes').MigrationQueryInterface} */ (params.context ?? params);

      await queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping smart scrape strategy replacement - domain table does not exist yet');
            return;
         }
         const columns = await queryInterface.describeTable('domain');
         if (!columns.scrape_strategy) {
            return;
         }

         const [countRows] = await queryInterface.sequelize.query(
            "SELECT COUNT(*) AS total FROM domain WHERE scrape_strategy = 'smart'",
            { transaction }
         );
         const countRow = /** @type {{total?: number | string} | undefined} */ (Array.isArray(countRows) ? countRows[0] : undefined);
         const rowsUpdated = Number(countRow?.total ?? 0);
         await queryInterface.sequelize.query(
            "UPDATE domain SET scrape_strategy = 'basic' WHERE scrape_strategy = 'smart'",
            { transaction }
         );
         logger.info(`[MIGRATION] Replaced the smart scrape strategy with basic on ${rowsUpdated} domain(s).`);
      });

      if (replaceGlobalSmartStrategy()) {
         logger.info('[MIGRATION] Replaced the global smart scrape strategy in data/settings.json with basic.');
      }
   },

   // Data-only migration: domains that used smart are not restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] Smart scrape strategy replacement has no rollback.');
   },
};

module.exports.replaceGlobalSmartStrategy = replaceGlobalSmartStrategy;
