// Migration: Drop the unused `scrape_smart_full_fallback` column from the `domain` table.
//
// The column was added with the removed "smart" scrape strategy. Nothing reads or writes it any more
// (see 1779000000000-replace-smart-scrape-strategy.js, which left it in place).
//
// Idempotent: skips when the table or the column is missing. Before the column is dropped the database is
// backed up to <file>.bak-<date>. Down adds the column back with its original definition when it is missing.

const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping drop of domain.scrape_smart_full_fallback - domain table does not exist yet');
            return;
         }

         if (!domainTableDefinition?.scrape_smart_full_fallback) {
            logger.info('[MIGRATION] domain.scrape_smart_full_fallback not found, skipping');
            return;
         }

         // Keep a consistent database snapshot before the column is removed
         await backupDatabaseFile(queryInterface);

         await queryInterface.removeColumn('domain', 'scrape_smart_full_fallback', { transaction });
         logger.info('[MIGRATION] Dropped column: domain.scrape_smart_full_fallback');
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping rollback of domain.scrape_smart_full_fallback - domain table does not exist');
            return;
         }

         if (!domainTableDefinition?.scrape_smart_full_fallback) {
            await queryInterface.addColumn(
               'domain',
               'scrape_smart_full_fallback',
               { type: SequelizeLib.DataTypes.BOOLEAN, defaultValue: false },
               { transaction }
            );
            logger.info('[MIGRATION] Restored column: domain.scrape_smart_full_fallback');
         }
      });
   },
};
