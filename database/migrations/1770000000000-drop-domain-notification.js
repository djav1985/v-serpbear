// Migration: Drop the obsolete `notification` column from the `domain` table.
//
// The `notification` field was historically kept in sync with `scrapeEnabled`,
// serving no independent purpose. Domain notification eligibility is now
// determined solely by `scrapeEnabled`.

module.exports = {
   up: async function up(params = {}, _legacySequelize) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let domainTableExists = false;
         let columns = {};

         try {
            columns = await queryInterface.describeTable('domain');
            domainTableExists = true;
         } catch (_error) {
            // Table doesn't exist yet; nothing to do
         }

         if (domainTableExists && columns.notification) {
            await queryInterface.removeColumn('domain', 'notification', { transaction: t });
            console.log('[MIGRATION] Dropped column: domain.notification');
         } else {
            console.log('[MIGRATION] domain.notification not found, skipping');
         }
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (t) => {
         let domainTableExists = false;
         let columns = {};

         try {
            columns = await queryInterface.describeTable('domain');
            domainTableExists = true;
         } catch (_error) {
            // Table doesn't exist
         }

         if (domainTableExists && !columns.notification) {
            await queryInterface.addColumn(
               'domain',
               'notification',
               { type: SequelizeLib.DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
               { transaction: t },
            );
            console.log('[MIGRATION] Restored column: domain.notification');
         }
      });
   },
};
