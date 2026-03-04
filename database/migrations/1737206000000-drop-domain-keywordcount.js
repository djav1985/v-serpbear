// Migration: Remove keywordCount column from domain table.

const { logger } = require('../migrationLogger');

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            // Table doesn't exist yet - skip migration
            // Tables will be created by db.sync() after migrations run
            logger.info('[MIGRATION] Skipping migration - domain table does not exist yet');
            return;
         }

         if (domainTableDefinition?.keywordCount) {
            await queryInterface.removeColumn('domain', 'keywordCount', { transaction });
         }

         logger.info('Removed domain.keywordCount column.');
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
            // Table doesn't exist - skip rollback
            logger.info('[MIGRATION] Skipping rollback - domain table does not exist');
            return;
         }

         if (!domainTableDefinition?.keywordCount) {
            await queryInterface.addColumn(
               'domain',
               'keywordCount',
               { type: SequelizeLib.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
               { transaction }
            );
         }

         logger.info('Restored domain.keywordCount column.');
      });
   },
};
