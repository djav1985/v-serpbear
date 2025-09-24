// Migration: Adds scrape_enabled and notify_enabled flags to the domain table so
// scraping and notification behaviour can be toggled per domain.

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

            if (domainTableDefinition && !domainTableDefinition.scrape_enabled) {
               await queryInterface.addColumn(
                  'domain',
                  'scrape_enabled',
                  { type: SequelizeLib.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                  { transaction: t }
               );
            }

            if (domainTableDefinition && !domainTableDefinition.notify_enabled) {
               await queryInterface.addColumn(
                  'domain',
                  'notify_enabled',
                  { type: SequelizeLib.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                  { transaction: t }
               );

               if (domainTableDefinition.notification) {
                  await queryInterface.sequelize.query(
                     'UPDATE domain SET notify_enabled = notification',
                     { transaction: t }
                  );
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
            const domainTableDefinition = await queryInterface.describeTable('domain');

            if (domainTableDefinition && domainTableDefinition.notify_enabled) {
               await queryInterface.removeColumn('domain', 'notify_enabled', { transaction: t });
            }

            if (domainTableDefinition && domainTableDefinition.scrape_enabled) {
               await queryInterface.removeColumn('domain', 'scrape_enabled', { transaction: t });
            }
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
};
