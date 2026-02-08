// Migration: Adds mapPackTop3 field to keyword table to track whether a keyword appears in top 3 map pack results

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            let keywordTableDefinition;
            try {
               keywordTableDefinition = await queryInterface.describeTable('keyword');
            } catch (_describeError) {
               // Table doesn't exist yet - skip migration
               // Tables will be created by db.sync() after migrations run
               console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
               return;
            }

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
            console.error('error :', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            let keywordTableDefinition;
            try {
               keywordTableDefinition = await queryInterface.describeTable('keyword');
            } catch (_describeError) {
               // Table doesn't exist - skip rollback
               console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
               return;
            }

            if (keywordTableDefinition?.mapPackTop3) {
               await queryInterface.removeColumn('keyword', 'mapPackTop3', { transaction });
            }
         } catch (error) {
            console.error('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
