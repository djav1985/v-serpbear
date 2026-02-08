
module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         let keywordTableDefinition;
         try {
            keywordTableDefinition = await queryInterface.describeTable('keyword');
         } catch (_describeError) {
            // Table doesn't exist yet - skip migration
            // Tables will be created by db.sync() after migrations run
            console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
            return;
         }

         if (keywordTableDefinition?.history) {
            await queryInterface.changeColumn(
               'keyword',
               'history',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify({})
               },
               { transaction }
            );
         }

         await queryInterface.sequelize.query(
            [
               "UPDATE keyword SET history = '{}'",
               "WHERE history IS NULL",
               "OR TRIM(history) = ''",
               "OR history = '[]'",
               "OR LOWER(history) = 'null'",
               "OR LOWER(history) = 'false'"
            ].join(' '),
            { transaction }
         );

         console.log('Normalised keyword history defaults to empty objects.');
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         let keywordTableDefinition;
         try {
            keywordTableDefinition = await queryInterface.describeTable('keyword');
         } catch (_describeError) {
            // Table doesn't exist - skip rollback
            console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
            return;
         }

         if (keywordTableDefinition?.history) {
            await queryInterface.changeColumn(
               'keyword',
               'history',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([])
               },
               { transaction }
            );
         }

         await queryInterface.sequelize.query(
            [
               "UPDATE keyword SET history = '[]'",
               "WHERE history IS NULL",
               "OR TRIM(history) = ''",
               "OR history = '{}'",
               "OR LOWER(history) = 'null'",
               "OR LOWER(history) = 'false'"
            ].join(' '),
            { transaction }
         );

         console.log('Reverted keyword history defaults to legacy empty arrays.');
      });
   }
};
