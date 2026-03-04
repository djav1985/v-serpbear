// Migration: Adds state field to keyword table.

const { logger } = require('../migrationLogger');

// CLI Migration
module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            let keywordTableDefinition;
            try {
               keywordTableDefinition = await queryInterface.describeTable('keyword');
            } catch (_describeError) {
               // Table doesn't exist yet - skip migration
               // Tables will be created by db.sync() after migrations run
               logger.info('[MIGRATION] Skipping migration - keyword table does not exist yet');
               return;
            }
            if (keywordTableDefinition && !keywordTableDefinition.state) {
               await queryInterface.addColumn(
                  'keyword',
                  'state',
                  { type: SequelizeLib.DataTypes.STRING },
                  { transaction: t }
               );
            }
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },
   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            let keywordTableDefinition;
            try {
               keywordTableDefinition = await queryInterface.describeTable('keyword');
            } catch (_describeError) {
               // Table doesn't exist - skip rollback
               logger.info('[MIGRATION] Skipping rollback - keyword table does not exist');
               return;
            }
            if (keywordTableDefinition && keywordTableDefinition.state) {
               await queryInterface.removeColumn('keyword', 'state', { transaction: t });
            }
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },
};
