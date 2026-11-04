// Migration: a keyword refresh that was interrupted (for example by a restart) leaves updating = 1 behind, so the
// keyword looks like it is refreshing forever. This clears the flag and the start time on those rows.
// Idempotent: running it again finds no truthy flags and changes nothing. Down is a no-op, because the stale
// state cannot be restored.

const { logger } = require('../migrationLogger');

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
            logger.info('[MIGRATION] Skipping stale updating flag reset - keyword table does not exist yet');
            return;
         }

         const columns = await queryInterface.sequelize.query(
            'PRAGMA table_info(keyword)',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );
         const columnNames = new Set((columns || []).map((column) => column.name));
         if (!columnNames.has('updating')) {
            logger.info('[MIGRATION] Skipping stale updating flag reset - keyword.updating column does not exist');
            return;
         }

         const [countRows] = await queryInterface.sequelize.query(
            'SELECT COUNT(*) AS count FROM keyword WHERE updating',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );
         const staleCount = Number(countRows?.count ?? 0);
         if (staleCount === 0) {
            return;
         }

         const startedAtClause = columnNames.has('updatingStartedAt') ? ', updatingStartedAt = NULL' : '';
         await queryInterface.sequelize.query(
            `UPDATE keyword SET updating = 0${startedAtClause} WHERE updating`,
            { transaction }
         );
         logger.info(`[MIGRATION] Reset stale updating flag on ${staleCount} keyword row(s)`);
      });
   },

   down: async function down() {
      // No-op: the stale refresh state cannot be restored
   },
};
