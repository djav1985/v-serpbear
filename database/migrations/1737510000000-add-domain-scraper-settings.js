// Migration: Add scraper_settings column to domain table for per-domain scraper overrides.

module.exports = {
   up: async function up(params = {}, legacySequelize) {
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
            // Table doesn't exist yet - skip migration
            // Tables will be created by db.sync() after migrations run
            console.log('[MIGRATION] Skipping migration - domain table does not exist yet');
            return;
         }

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
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            // Table doesn't exist - skip rollback
            console.log('[MIGRATION] Skipping rollback - domain table does not exist');
            return;
         }

         if (domainTableDefinition?.scraper_settings) {
            await queryInterface.removeColumn('domain', 'scraper_settings', { transaction });
         }

         console.log('Removed domain.scraper_settings column.');
      });
   },
};
