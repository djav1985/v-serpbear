// Migration: Drop the unused `tags` column from the `domain` table.
//
// Tags belong to keywords (keyword.tags). The domain table's tags column was never read or written by the app,
// so it is dead data. The keyword tags column is unrelated and stays.
//
// Idempotent: skips when the table or the column is missing. Before the column is dropped the database is
// backed up to <file>.bak-<date>. Down adds the column back with its original definition when it is missing.

const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

module.exports = {
   /**
    * @param {import('./migrationTypes').MigrationParams} [params={}]
    * @param {typeof import('sequelize')} [_legacySequelize]
    */
   up: async function up(params = {}, _legacySequelize) {
      const queryInterface = /** @type {import('./migrationTypes').MigrationQueryInterface} */ (params.context ?? params);

      return queryInterface.sequelize.transaction(async (transaction) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping drop of domain.tags - domain table does not exist yet');
            return;
         }

         if (!domainTableDefinition?.tags) {
            logger.info('[MIGRATION] domain.tags not found, skipping');
            return;
         }

         // Keep a consistent database snapshot before the column is removed
         await backupDatabaseFile(queryInterface);

         await queryInterface.removeColumn('domain', 'tags', { transaction });
         logger.info('[MIGRATION] Dropped column: domain.tags');
      });
   },

   /**
    * @param {import('./migrationTypes').MigrationParams} [params={}]
    * @param {typeof import('sequelize')} [legacySequelize]
    */
   down: async function down(params = {}, legacySequelize) {
      const queryInterface = /** @type {import('./migrationTypes').MigrationQueryInterface} */ (params.context ?? params);
      const SequelizeLib = /** @type {typeof import('sequelize')} */ (/** @type {unknown} */ (params.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize')));

      return queryInterface.sequelize.transaction(async (transaction) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping rollback of domain.tags - domain table does not exist');
            return;
         }

         if (!domainTableDefinition?.tags) {
            await queryInterface.addColumn(
               'domain',
               'tags',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: '[]' },
               { transaction }
            );
            logger.info('[MIGRATION] Restored column: domain.tags');
         }
      });
   },
};
