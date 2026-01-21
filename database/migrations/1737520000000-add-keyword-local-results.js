// Migration: Adds localResults field to keyword table to store local/map pack search results
const { logger } = require('../../utils/logger');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');

            if (!keywordTableDefinition?.localResults) {
               await queryInterface.addColumn(
                  'keyword',
                  'localResults',
                  {
                     type: SequelizeLib.DataTypes.STRING,
                     allowNull: true,
                     defaultValue: JSON.stringify([]),
                  },
                  { transaction }
               );
            }
         } catch (error) {
            logger.info('error :', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');

            if (keywordTableDefinition?.localResults) {
               await queryInterface.removeColumn('keyword', 'localResults', { transaction });
            }
         } catch (error) {
            logger.info('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
