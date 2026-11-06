// Migration: Remove legacy "skipped" placeholder entries from keyword.lastResult.
//
// Older releases wrote { position, url, title, skipped: true } into keyword.lastResult for pages that were not
// scraped. The code that wrote and displayed those entries has been removed, so old rows would render blank rows
// until the next refresh. Only entries with skipped === true are removed; real result entries are kept as they are.
//
// Idempotent: skips when the keyword table or the lastResult column is missing. Rows are read in batches. Only rows
// that change are written back. Before the first write the database is backed up to <file>.bak-<date>.
// Down is a no-op: the removed placeholder entries cannot be restored.

const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

const BATCH_SIZE = 500;

// Returns the JSON text of lastResult without the skipped entries, or null when the row must be left untouched
// (null, empty, invalid JSON, not an array, or no skipped entries).
const stripSkippedEntries = (raw) => {
   if (typeof raw !== 'string' || raw.trim() === '') {
      return null;
   }
   let parsed;
   try {
      parsed = JSON.parse(raw);
   } catch (_error) {
      return null;
   }
   if (!Array.isArray(parsed)) {
      return null;
   }
   const kept = parsed.filter((entry) => !(entry && typeof entry === 'object' && entry.skipped === true));
   return kept.length === parsed.length ? null : JSON.stringify(kept);
};

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping removal of skipped lastResult entries - keyword table does not exist yet');
            return;
         }

         // PRAGMA instead of describeTable: Sequelize's describeTable throws on the expression index
         // keyword_tracking_target_idx (COALESCE columns have no name), which would abort the upgrade.
         const columns = await queryInterface.sequelize.query('PRAGMA table_info(`keyword`)', {
            transaction,
            type: SequelizeLib.QueryTypes.SELECT,
         });
         if (!Array.isArray(columns) || !columns.some((column) => column.name === 'lastResult')) {
            logger.info('[MIGRATION] keyword.lastResult not found, skipping');
            return;
         }

         let backedUp = false;
         let updatedCount = 0;
         let lastId = 0;
         for (;;) {
            const rows = await queryInterface.sequelize.query(
               'SELECT ID, lastResult FROM keyword WHERE ID > :lastId ORDER BY ID LIMIT :limit',
               {
                  transaction,
                  type: SequelizeLib.QueryTypes.SELECT,
                  replacements: { lastId, limit: BATCH_SIZE },
               }
            );
            if (!rows || rows.length === 0) {
               break;
            }

            for (const row of rows) {
               const stripped = stripSkippedEntries(row.lastResult);
               if (stripped === null) {
                  continue;
               }
               if (!backedUp) {
                  // Keep a consistent database snapshot before the first row is rewritten
                  await backupDatabaseFile(queryInterface);
                  backedUp = true;
               }
               await queryInterface.sequelize.query(
                  'UPDATE keyword SET lastResult = :lastResult WHERE ID = :id',
                  { transaction, replacements: { lastResult: stripped, id: row.ID } }
               );
               updatedCount += 1;
            }

            lastId = rows[rows.length - 1].ID;
            if (rows.length < BATCH_SIZE) {
               break;
            }
         }

         logger.info(`Removed skipped placeholder entries from lastResult for ${updatedCount} keyword(s).`);
      });
   },

   // Data-only migration: the removed placeholder entries cannot be restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] Removed skipped lastResult entries cannot be restored; nothing to roll back.');
   },
};
