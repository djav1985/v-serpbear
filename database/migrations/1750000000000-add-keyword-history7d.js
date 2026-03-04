// Migration: Add history7d column to keyword table.
// Stores the last 7 days of position history as a JSON string, pre-computed at write time.
// This avoids per-request sorting when the GET /api/keywords endpoint slices history.

const { logger } = require('../migrationLogger');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         let tableDefinition;
         try {
            tableDefinition = await queryInterface.describeTable('keyword');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping migration - keyword table does not exist yet');
            return;
         }

         if (!tableDefinition?.history7d) {
            await queryInterface.addColumn(
               'keyword',
               'history7d',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: null },
               { transaction },
            );
         }

         logger.info('[MIGRATION] Added keyword.history7d column.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         let tableDefinition;
         try {
            tableDefinition = await queryInterface.describeTable('keyword');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping rollback - keyword table does not exist');
            return;
         }

         if (tableDefinition?.history7d) {
            await queryInterface.removeColumn('keyword', 'history7d', { transaction });
         }

         logger.info('[MIGRATION] Removed keyword.history7d column.');
      });
   },
};
