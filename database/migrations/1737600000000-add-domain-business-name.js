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
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            // Table doesn't exist yet - skip migration
            // Tables will be created by db.sync() after migrations run
            console.log('[MIGRATION] Skipping migration - domain table does not exist yet');
            return;
         }

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
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            // Table doesn't exist - skip rollback
            console.log('[MIGRATION] Skipping rollback - domain table does not exist');
            return;
         }

         if (domainTableDefinition?.business_name) {
            await queryInterface.removeColumn('domain', 'business_name', { transaction });
         }

         console.log('Removed domain.business_name column.');
      });
   },
};
