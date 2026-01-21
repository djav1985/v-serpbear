// Migration: Adds mapPackTop3 field to keyword table to track whether a keyword appears in top 3 map pack results
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

            if (!keywordTableDefinition?.mapPackTop3) {
               await queryInterface.addColumn(
                  'keyword',
                  'mapPackTop3',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: true, // Add as nullable first to avoid table locks
                     defaultValue: false,
                  },
                  { transaction }
               );

               await queryInterface.sequelize.query(
                  [
                     'UPDATE keyword',
                     'SET mapPackTop3 = 0',
                     'WHERE mapPackTop3 IS NULL',
                  ].join(' '),
                  { transaction }
               );

               // Now that values are backfilled, enforce NOT NULL
               await queryInterface.changeColumn(
                  'keyword',
                  'mapPackTop3',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: false,
                     defaultValue: false,
                  },
                  { transaction }
               );
            }
         } catch (error) {
            logger.error('error :', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');

            if (keywordTableDefinition?.mapPackTop3) {
               await queryInterface.removeColumn('keyword', 'mapPackTop3', { transaction });
            }
         } catch (error) {
            logger.error('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
