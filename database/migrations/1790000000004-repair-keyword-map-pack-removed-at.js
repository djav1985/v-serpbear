// Migration: repairs databases where 1790000000003 was recorded as run but never added keyword.mapPackRemovedAt.
// That happened when describeTable crashed on the expression index of the keyword table and the crash was read as
// "no keyword table". Adds the column only when it is missing, so it is a no-op everywhere else.

const { logger } = require('../migrationLogger');
const { getKeywordColumns } = require('./1790000000003-add-keyword-map-pack-removed-at');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const columns = await getKeywordColumns(queryInterface, transaction);
            // No table yet (fresh install): db.sync() creates it with the column
            if (columns.length === 0 || columns.includes('mapPackRemovedAt')) {
               return;
            }

            await queryInterface.addColumn(
               'keyword',
               'mapPackRemovedAt',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
               },
               { transaction }
            );
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },

   // Nothing to undo: 1790000000003 owns the column
   down: async function down() {},
};
