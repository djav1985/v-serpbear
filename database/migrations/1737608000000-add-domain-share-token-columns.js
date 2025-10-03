// Migration: Add share token columns to domain table for secure dashboard sharing.

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (!domainTableDefinition?.share_token_hash) {
            await queryInterface.addColumn(
               'domain',
               'share_token_hash',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: null },
               { transaction },
            );
         }

         if (!domainTableDefinition?.share_token_expires_at) {
            await queryInterface.addColumn(
               'domain',
               'share_token_expires_at',
               { type: SequelizeLib.DataTypes.DATE, allowNull: true, defaultValue: null },
               { transaction },
            );
         }

         console.log('Ensured domain share token columns exist.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const domainTableDefinition = await queryInterface.describeTable('domain');

         if (domainTableDefinition?.share_token_expires_at) {
            await queryInterface.removeColumn('domain', 'share_token_expires_at', { transaction });
         }

         if (domainTableDefinition?.share_token_hash) {
            await queryInterface.removeColumn('domain', 'share_token_hash', { transaction });
         }

         console.log('Removed domain share token columns.');
      });
   },
};
