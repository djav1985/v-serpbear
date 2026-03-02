// Migration: Adds scrape_strategy, scrape_pagination_limit, and scrape_smart_full_fallback fields to domain table.

module.exports = {
   up: async function up(queryInterface, Sequelize) {
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            const domainTableDefinition = await queryInterface.describeTable('domain');
            if (domainTableDefinition && !domainTableDefinition.scrape_strategy) {
               await queryInterface.addColumn('domain', 'scrape_strategy', { type: Sequelize.DataTypes.STRING, defaultValue: '' }, { transaction: t });
            }
            if (domainTableDefinition && !domainTableDefinition.scrape_pagination_limit) {
               await queryInterface.addColumn('domain', 'scrape_pagination_limit', { type: Sequelize.DataTypes.INTEGER, defaultValue: 0 }, { transaction: t });
            }
            if (domainTableDefinition && !domainTableDefinition.scrape_smart_full_fallback) {
               await queryInterface.addColumn('domain', 'scrape_smart_full_fallback', { type: Sequelize.DataTypes.BOOLEAN, defaultValue: false }, { transaction: t });
            }
         } catch (error) {
            console.log('[MIGRATION] Skipping add-domain-scrape-strategy-fields — table does not exist yet:', error);
         }
      });
   },
   down: async function down(queryInterface) {
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            const domainTableDefinition = await queryInterface.describeTable('domain');
            if (domainTableDefinition && domainTableDefinition.scrape_strategy) {
               await queryInterface.removeColumn('domain', 'scrape_strategy', { transaction: t });
            }
            if (domainTableDefinition && domainTableDefinition.scrape_pagination_limit) {
               await queryInterface.removeColumn('domain', 'scrape_pagination_limit', { transaction: t });
            }
            if (domainTableDefinition && domainTableDefinition.scrape_smart_full_fallback) {
               await queryInterface.removeColumn('domain', 'scrape_smart_full_fallback', { transaction: t });
            }
         } catch (error) {
            console.log('[MIGRATION] Skipping down add-domain-scrape-strategy-fields:', error);
         }
      });
   },
};
