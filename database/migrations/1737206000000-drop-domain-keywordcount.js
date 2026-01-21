// Migration: Remove keywordCount column from domain table.

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (domainTableDefinition?.keywordCount) {
            await queryInterface.removeColumn('domain', 'keywordCount', { transaction });
         }

         console.log('Removed domain.keywordCount column.');
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (!domainTableDefinition?.keywordCount) {
            await queryInterface.addColumn(
               'domain',
               'keywordCount',
               { type: SequelizeLib.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
               { transaction }
            );
         }

         console.log('Restored domain.keywordCount column.');
      });
   },
};
