// Migration: Consolidates notify_enabled into scrape_enabled so there's only one toggle
// for both scraping and notifications per domain.

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (t) => {
         try {
            const domainTableDefinition = await queryInterface.describeTable('domain');

            // Ensure scrape_enabled column exists
            if (domainTableDefinition && !domainTableDefinition.scrape_enabled) {
               await queryInterface.addColumn(
                  'domain',
                  'scrape_enabled',
                  { type: SequelizeLib.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                  { transaction: t }
               );
            }

            // If notify_enabled exists, consolidate its values into scrape_enabled
            // The logic should be: if either scrape_enabled OR notify_enabled is false, then scrape_enabled becomes false
            if (domainTableDefinition && domainTableDefinition.notify_enabled) {
               // Update scrape_enabled to be false if either scrape_enabled or notify_enabled is false
               await queryInterface.sequelize.query(
                  'UPDATE domain SET scrape_enabled = (scrape_enabled AND notify_enabled)',
                  { transaction: t }
               );

               // Also update the legacy notification column to match scrape_enabled
               if (domainTableDefinition.notification) {
                  await queryInterface.sequelize.query(
                     'UPDATE domain SET notification = scrape_enabled',
                     { transaction: t }
                  );
               }

               // Remove the notify_enabled column
               await queryInterface.removeColumn('domain', 'notify_enabled', { transaction: t });
            }

            console.log('Successfully consolidated domain toggle fields');
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (t) => {
         try {
            const domainTableDefinition = await queryInterface.describeTable('domain');

            // Re-add notify_enabled column if it doesn't exist
            if (domainTableDefinition && !domainTableDefinition.notify_enabled) {
               await queryInterface.addColumn(
                  'domain',
                  'notify_enabled',
                  { type: SequelizeLib.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                  { transaction: t }
               );

               // Set notify_enabled to match scrape_enabled
               if (domainTableDefinition.scrape_enabled) {
                  await queryInterface.sequelize.query(
                     'UPDATE domain SET notify_enabled = scrape_enabled',
                     { transaction: t }
                  );
               }
            }

            console.log('Successfully rolled back domain toggle fields consolidation');
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
};