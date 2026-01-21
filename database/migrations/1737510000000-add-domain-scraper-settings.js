// Migration: Add scraper_settings column to domain table for per-domain scraper overrides.

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (!domainTableDefinition?.scraper_settings) {
            await queryInterface.addColumn(
               'domain',
               'scraper_settings',
               { type: SequelizeLib.DataTypes.TEXT, allowNull: true, defaultValue: null },
               { transaction },
            );
         }

         console.log('Added domain.scraper_settings column.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (domainTableDefinition?.scraper_settings) {
            await queryInterface.removeColumn('domain', 'scraper_settings', { transaction });
         }

         console.log('Removed domain.scraper_settings column.');
      });
   },
};
