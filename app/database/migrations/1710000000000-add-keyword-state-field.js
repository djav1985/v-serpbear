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
            const keywordTableDefinition = await queryInterface.describeTable('keyword');
            if (keywordTableDefinition && !keywordTableDefinition.state) {
               await queryInterface.addColumn(
                  'keyword',
                  'state',
                  { type: SequelizeLib.DataTypes.STRING },
                  { transaction: t }
               );
            }
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');
            if (keywordTableDefinition && keywordTableDefinition.state) {
               await queryInterface.removeColumn('keyword', 'state', { transaction: t });
            }
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
};
