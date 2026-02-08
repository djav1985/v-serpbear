// Migration: Adds state field to keyword table.

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
               console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
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
            console.error('error :', error);
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
               console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
               return;
            }
            if (keywordTableDefinition && keywordTableDefinition.state) {
               await queryInterface.removeColumn('keyword', 'state', { transaction: t });
            }
         } catch (error) {
            console.error('error :', error);
            throw error;
         }
      });
   },
};
