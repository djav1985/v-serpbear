// Migration: Optimize keyword structured columns, indexes, and foreign key constraints

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const keywordTableDefinition = await queryInterface.describeTable('keyword');

         if (keywordTableDefinition?.history) {
            await queryInterface.changeColumn(
               'keyword',
               'history',
               {
                  type: SequelizeLib.DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: JSON.stringify({}),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.url) {
            await queryInterface.changeColumn(
               'keyword',
               'url',
               {
                  type: SequelizeLib.DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.tags) {
            await queryInterface.changeColumn(
               'keyword',
               'tags',
               {
                  type: SequelizeLib.DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.lastResult) {
            await queryInterface.changeColumn(
               'keyword',
               'lastResult',
               {
                  type: SequelizeLib.DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.localResults) {
            await queryInterface.changeColumn(
               'keyword',
               'localResults',
               {
                  type: SequelizeLib.DataTypes.TEXT,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         const existingIndexes = await queryInterface.showIndex('keyword').catch(() => []);
         const existingIndexNames = new Set(existingIndexes.map((index) => index.name));

         const addIndexIfMissing = async (name, fields) => {
            if (!existingIndexNames.has(name)) {
               await queryInterface.addIndex('keyword', fields, { name, transaction });
            }
         };

         await addIndexIfMissing('keyword_domain_idx', ['domain']);
         await addIndexIfMissing('keyword_keyword_idx', ['keyword']);
         await addIndexIfMissing('keyword_device_idx', ['device']);
         await addIndexIfMissing('keyword_country_idx', ['country']);

         if (!keywordTableDefinition?.domain?.references) {
            await queryInterface.addConstraint('keyword', {
               fields: ['domain'],
               type: 'foreign key',
               name: 'keyword_domain_fk',
               references: {
                  table: 'domain',
                  field: 'domain',
               },
               onUpdate: 'CASCADE',
               onDelete: 'CASCADE',
               transaction,
            });
         }
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const keywordTableDefinition = await queryInterface.describeTable('keyword');

         if (keywordTableDefinition?.history) {
            await queryInterface.changeColumn(
               'keyword',
               'history',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify({}),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.url) {
            await queryInterface.changeColumn(
               'keyword',
               'url',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.tags) {
            await queryInterface.changeColumn(
               'keyword',
               'tags',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.lastResult) {
            await queryInterface.changeColumn(
               'keyword',
               'lastResult',
               {
                  type: SequelizeLib.DataTypes.STRING,
                  allowNull: true,
                  defaultValue: JSON.stringify([]),
               },
               { transaction }
            );
         }

         if (keywordTableDefinition?.localResults) {
            await queryInterface.changeColumn(
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

         await queryInterface.removeConstraint('keyword', 'keyword_domain_fk', { transaction }).catch(() => undefined);
         await queryInterface.removeIndex('keyword', 'keyword_keyword_idx', { transaction }).catch(() => undefined);
         await queryInterface.removeIndex('keyword', 'keyword_domain_idx', { transaction }).catch(() => undefined);
         await queryInterface.removeIndex('keyword', 'keyword_device_idx', { transaction }).catch(() => undefined);
         await queryInterface.removeIndex('keyword', 'keyword_country_idx', { transaction }).catch(() => undefined);
      });
   },
};
