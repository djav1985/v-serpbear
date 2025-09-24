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
         const domainTableDefinition = await queryInterface.describeTable('domain');
         if (domainTableDefinition && !domainTableDefinition.search_console) {
            await queryInterface.addColumn(
               'domain',
               'search_console',
               { type: SequelizeLib.DataTypes.STRING },
               { transaction: t }
            );
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
            if (domainTableDefinition && domainTableDefinition.search_console) {
               await queryInterface.removeColumn('domain', 'search_console', { transaction: t });
            }
         } catch (error) {
            console.log('error :', error);
            throw error;
         }
      });
   },
 };
