// Migration: Adds volume field to the keyword table.

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
            if (keywordTableDefinition) {
               if (!keywordTableDefinition.volume) {
                  await queryInterface.addColumn('keyword', 'volume', {
                     type: SequelizeLib.DataTypes.STRING, allowNull: false, defaultValue: 0,
                 }, { transaction: t });
               }
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
            if (keywordTableDefinition) {
               if (keywordTableDefinition.volume) {
                  await queryInterface.removeColumn('keyword', 'volume', { transaction: t });
               }
            }
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
};
