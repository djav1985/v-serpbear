// Migration: Adds compact history column and hot-path indexes for keyword refresh/list queries

const TABLE = 'keyword';
const INDEXES = [
   { name: 'keyword_updating_idx', fields: ['updating'] },
   { name: 'keyword_domain_updating_idx', fields: ['domain', 'updating'] },
   { name: 'keyword_domain_id_idx', fields: ['domain', 'ID'] },
   { name: 'keyword_domain_device_country_idx', fields: ['domain', 'device', 'country'] },
];

const hasIndex = async (queryInterface, tableName, indexName) => {
   try {
      const indexes = await queryInterface.showIndex(tableName);
      return indexes.some((index) => index.name === indexName);
   } catch (_error) {
      return false;
   }
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (transaction) => {
         let keywordTableDefinition;
         try {
            keywordTableDefinition = await queryInterface.describeTable(TABLE);
         } catch (_error) {
            console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
            return;
         }

         if (!keywordTableDefinition?.history7d) {
            await queryInterface.addColumn(
               TABLE,
               'history7d',
               { type: queryInterface.sequelize.Sequelize.STRING, allowNull: true, defaultValue: JSON.stringify({}) },
               { transaction }
            );
         }

         for (const indexConfig of INDEXES) {
            const exists = await hasIndex(queryInterface, TABLE, indexConfig.name);
            if (!exists) {
               await queryInterface.addIndex(TABLE, indexConfig.fields, {
                  name: indexConfig.name,
                  transaction,
               });
            }
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (transaction) => {
         let keywordTableDefinition;
         try {
            keywordTableDefinition = await queryInterface.describeTable(TABLE);
         } catch (_error) {
            console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
            return;
         }

         for (const indexConfig of INDEXES) {
            const exists = await hasIndex(queryInterface, TABLE, indexConfig.name);
            if (exists) {
               await queryInterface.removeIndex(TABLE, indexConfig.name, { transaction });
            }
         }

         if (keywordTableDefinition?.history7d) {
            await queryInterface.removeColumn(TABLE, 'history7d', { transaction });
         }
      });
   },
};
