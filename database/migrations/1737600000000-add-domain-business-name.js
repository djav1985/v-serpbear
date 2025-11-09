// Migration: Add business_name column to domain table as a standalone field.
// This field stores the business name for map pack detection, independent of scraper settings.

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (!domainTableDefinition?.business_name) {
            await queryInterface.addColumn(
               'domain',
               'business_name',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: null },
               { transaction },
            );
         }

         console.log('Added domain.business_name column.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (domainTableDefinition?.business_name) {
            await queryInterface.removeColumn('domain', 'business_name', { transaction });
         }

         console.log('Removed domain.business_name column.');
      });
   },
};
