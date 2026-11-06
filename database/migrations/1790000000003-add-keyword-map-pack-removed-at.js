// Migration: Adds mapPackRemovedAt field to keyword table: the day (YYYY-MM-DD) a keyword dropped out of the map pack top three
//
// The columns are read with PRAGMA table_info instead of describeTable: Sequelize's SQLite describeTable throws
// ("Cannot set properties of undefined (setting 'unique')") when the table has an index on an expression, like
// keyword_tracking_target_idx. Treating that error as "table does not exist" skipped the migration and umzug then
// recorded it as run. Only an empty PRAGMA result (no such table) is a skip now; any other error fails the migration.

const { logger } = require('../migrationLogger');

const getKeywordColumns = async (queryInterface, transaction) => {
   const [rows] = await queryInterface.sequelize.query('PRAGMA table_info(`keyword`)', { transaction });
   return rows.map((row) => row.name);
};

module.exports = {
   getKeywordColumns,

   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const columns = await getKeywordColumns(queryInterface, transaction);
            if (columns.length === 0) {
               // Table doesn't exist yet - skip migration
               // Tables will be created by db.sync() after migrations run
               logger.info('[MIGRATION] Skipping migration - keyword table does not exist yet');
               return;
            }

            if (!columns.includes('mapPackRemovedAt')) {
               await queryInterface.addColumn(
                  'keyword',
                  'mapPackRemovedAt',
                  {
                     type: SequelizeLib.DataTypes.STRING,
                     allowNull: true,
                  },
                  { transaction }
               );
            }
         } catch (error) {
            logger.error('Migration error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const columns = await getKeywordColumns(queryInterface, transaction);
            if (columns.includes('mapPackRemovedAt')) {
               await queryInterface.removeColumn('keyword', 'mapPackRemovedAt', { transaction });
            }
         } catch (error) {
            logger.error('Migration rollback error', error instanceof Error ? error : new Error(String(error)));
            throw error;
         }
      });
   },
};
