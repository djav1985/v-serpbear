// Migration: Adds avgPosition and mapPackKeywords columns to domain table
// to store calculated values from keyword scraping instead of computing on demand

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

            // Add avgPosition column if it doesn't exist
            if (domainTableDefinition && !domainTableDefinition.avgPosition) {
               await queryInterface.addColumn(
                  'domain',
                  'avgPosition',
                  { 
                     type: SequelizeLib.DataTypes.INTEGER, 
                     allowNull: true, 
                     defaultValue: 0
                  },
                  { transaction: t }
               );
            }

            // Add mapPackKeywords column if it doesn't exist
            if (domainTableDefinition && !domainTableDefinition.mapPackKeywords) {
               await queryInterface.addColumn(
                  'domain',
                  'mapPackKeywords',
                  { 
                     type: SequelizeLib.DataTypes.INTEGER, 
                     allowNull: true, 
                     defaultValue: 0
                  },
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
            const domainTableDefinition = await queryInterface.describeTable('domain');

            if (domainTableDefinition && domainTableDefinition.avgPosition) {
               await queryInterface.removeColumn('domain', 'avgPosition', { transaction: t });
            }

            if (domainTableDefinition && domainTableDefinition.mapPackKeywords) {
               await queryInterface.removeColumn('domain', 'mapPackKeywords', { transaction: t });
            }
         } catch (error) {
            console.error('error :', error);
            throw error;
         }
      });
   },
};