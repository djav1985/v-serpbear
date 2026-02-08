// Migration: Adds search_console field to domain table to assign search console property type, url and api.

// CLI Migration
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
            console.log('[MIGRATION] Skipping migration - domain table does not exist yet');
            return;
         }
         if (domainTableDefinition && !domainTableDefinition.search_console) {
            await queryInterface.addColumn(
               'domain',
               'search_console',
               { type: SequelizeLib.DataTypes.STRING },
               { transaction: t }
            );
         }
      } catch (error) {
         console.error('error :', error);
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
               console.log('[MIGRATION] Skipping rollback - domain table does not exist');
               return;
            }
            if (domainTableDefinition && domainTableDefinition.search_console) {
               await queryInterface.removeColumn('domain', 'search_console', { transaction: t });
            }
         } catch (error) {
            console.error('error :', error);
            throw error;
         }
      });
   },
 };
