// Migration: Drop the unused per-domain `notification_interval` column from the `domain` table.
//
// Notification frequency is a single global setting (settings.notification_interval). Each domain only
// carries notification_emails, so the per-domain column is dead data.
//
// Idempotent: skips when the table or the column is missing. Before the column is dropped the database is
// backed up to <file>.bak-<date>. Down adds the column back with its old default ('daily') when it is missing.

const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping drop of domain.notification_interval - domain table does not exist yet');
            return;
         }

         const columns = await queryInterface.sequelize.query(
            'PRAGMA table_info(domain)',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );
         const columnNames = new Set((columns || []).map((column) => column.name));
         if (!columnNames.has('notification_interval')) {
            logger.info('[MIGRATION] domain.notification_interval not found, skipping');
            return;
         }

         // Keep a consistent database snapshot before the column is removed
         await backupDatabaseFile(queryInterface);

         await queryInterface.sequelize.query(
            'ALTER TABLE domain DROP COLUMN notification_interval',
            { transaction }
         );
         logger.info('[MIGRATION] Dropped column: domain.notification_interval');
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            return;
         }

         const columns = await queryInterface.sequelize.query(
            'PRAGMA table_info(domain)',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );
         const columnNames = new Set((columns || []).map((column) => column.name));
         if (columnNames.has('notification_interval')) {
            return;
         }

         await queryInterface.sequelize.query(
            "ALTER TABLE domain ADD COLUMN notification_interval TEXT DEFAULT 'daily'",
            { transaction }
         );
         logger.info('[MIGRATION] Restored column: domain.notification_interval');
      });
   },
};
