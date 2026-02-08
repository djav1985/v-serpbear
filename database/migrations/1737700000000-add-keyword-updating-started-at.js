// Migration: Adds updatingStartedAt field to keyword table to track refresh start time

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
               console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
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
            console.error('Migration error:', error);
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
               console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
               return;
            }

            if (keywordTableDefinition?.updatingStartedAt) {
               await queryInterface.removeColumn('keyword', 'updatingStartedAt', { transaction });
            }
         } catch (error) {
            console.error('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
