// Migration: Adds scrape_strategy, scrape_pagination_limit, and scrape_smart_full_fallback fields to domain table.

const { logger } = require('../migrationLogger');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (t) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping add-domain-scrape-strategy-fields — table does not exist yet');
            return;
         }

         if (domainTableDefinition && !domainTableDefinition.scrape_strategy) {
            await queryInterface.addColumn('domain', 'scrape_strategy', { type: SequelizeLib.DataTypes.STRING, defaultValue: '' }, { transaction: t });
         }
         if (domainTableDefinition && !domainTableDefinition.scrape_pagination_limit) {
            await queryInterface.addColumn('domain', 'scrape_pagination_limit', { type: SequelizeLib.DataTypes.INTEGER, defaultValue: 0 }, { transaction: t });
         }
         if (domainTableDefinition && !domainTableDefinition.scrape_smart_full_fallback) {
            await queryInterface.addColumn('domain', 'scrape_smart_full_fallback', { type: SequelizeLib.DataTypes.BOOLEAN, defaultValue: false }, { transaction: t });
         }
      });
   },
   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping down add-domain-scrape-strategy-fields — table does not exist');
            return;
         }

         if (domainTableDefinition && domainTableDefinition.scrape_strategy) {
            await queryInterface.removeColumn('domain', 'scrape_strategy', { transaction: t });
         }
         if (domainTableDefinition && domainTableDefinition.scrape_pagination_limit) {
            await queryInterface.removeColumn('domain', 'scrape_pagination_limit', { transaction: t });
         }
         if (domainTableDefinition && domainTableDefinition.scrape_smart_full_fallback) {
            await queryInterface.removeColumn('domain', 'scrape_smart_full_fallback', { transaction: t });
         }
      });
   },
};
