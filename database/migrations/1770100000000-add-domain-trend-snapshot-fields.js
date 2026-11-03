// Migration: Adds keywordsTracked and previous-refresh snapshot columns to domain table
// so the dashboard can show whether each stat went up or down since the last refresh

const { logger } = require('../migrationLogger');

const COLUMNS = ['keywordsTracked', 'prevKeywordsTracked', 'prevAvgPosition', 'prevMapPackKeywords'];

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (t) => {
         try {
            let domainTableDefinition;
            try {
               domainTableDefinition = await queryInterface.describeTable('domain');
            } catch (_describeError) {
               // Table doesn't exist yet - skip migration
               // Tables will be created by db.sync() after migrations run
               logger.info('[MIGRATION] Skipping migration - domain table does not exist yet');
               return;
            }

            for (const column of COLUMNS) {
               if (domainTableDefinition && !domainTableDefinition[column]) {
                  await queryInterface.addColumn(
                     'domain',
                     column,
                     {
                        type: SequelizeLib.DataTypes.INTEGER,
                        allowNull: true,
                        defaultValue: null,
                     },
                     { transaction: t }
                  );
               }
            }
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         try {
            let domainTableDefinition;
            try {
               domainTableDefinition = await queryInterface.describeTable('domain');
            } catch (_describeError) {
               // Table doesn't exist - skip rollback
               logger.info('[MIGRATION] Skipping rollback - domain table does not exist');
               return;
            }

            for (const column of COLUMNS) {
               if (domainTableDefinition && domainTableDefinition[column]) {
                  await queryInterface.removeColumn('domain', column, { transaction: t });
               }
            }
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },
};
