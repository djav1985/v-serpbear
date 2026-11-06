// Migration: Adds updatingStartedAt field to keyword table to track refresh start time

const { logger } = require('../migrationLogger');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
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

            if (!keywordTableDefinition?.updatingStartedAt) {
               await queryInterface.addColumn(
                  'keyword',
                  'updatingStartedAt',
                  {
                     type: SequelizeLib.DataTypes.STRING,
                     allowNull: true,
                  },
                  { transaction }
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

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            let keywordTableDefinition;
            try {
               keywordTableDefinition = await queryInterface.describeTable('keyword');
            } catch (_describeError) {
               // Table doesn't exist - skip rollback
               logger.info('[MIGRATION] Skipping rollback - keyword table does not exist');
               return;
            }

            if (keywordTableDefinition?.updatingStartedAt) {
               await queryInterface.removeColumn('keyword', 'updatingStartedAt', { transaction });
            }
         } catch (error) {
            logger.error('Migration rollback error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },
};
