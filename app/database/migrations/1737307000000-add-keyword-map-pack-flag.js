// Migration: Adds map_pack_top3 field to keyword table to track whether a keyword appears in top 3 map pack results

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

            if (!keywordTableDefinition?.map_pack_top3) {
               await queryInterface.addColumn(
                  'keyword',
                  'map_pack_top3',
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
                     'SET map_pack_top3 = 0',
                     'WHERE map_pack_top3 IS NULL',
                  ].join(' '),
                  { transaction }
               );

               // Now that values are backfilled, enforce NOT NULL
               await queryInterface.changeColumn(
                  'keyword',
                  'map_pack_top3',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: false,
                     defaultValue: false,
                  },
                  { transaction }
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

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');

            if (keywordTableDefinition?.map_pack_top3) {
               await queryInterface.removeColumn('keyword', 'map_pack_top3', { transaction });
            }
         } catch (error) {
            console.log('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
