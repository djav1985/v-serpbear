// Migration: Remove redundant database indexes.
//
// Removes two indexes that are made redundant by other existing constraints:
//
// 1. keyword_domain_idx (keyword.domain) — made redundant by keyword_domain_updating_idx
//    (domain, updating), which already covers leftmost-prefix queries on domain alone.
//
// 2. domain_slug_idx (domain.slug) — made redundant by the UNIQUE constraint on
//    domain.slug, which SQLite backs with its own implicit index.
//
// Removing these duplicate indexes reduces write overhead and storage cost.

const { logger } = require('../migrationLogger');

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let keywordTableExists = false;
         let domainTableExists = false;

         try {
            await queryInterface.describeTable('keyword');
            keywordTableExists = true;
         } catch (_error) {
            // Table doesn't exist yet
         }

         try {
            await queryInterface.describeTable('domain');
            domainTableExists = true;
         } catch (_error) {
            // Table doesn't exist yet
         }

         if (keywordTableExists) {
            try {
               await queryInterface.removeIndex('keyword', 'keyword_domain_idx', { transaction: t });
               logger.info('[MIGRATION] Removed redundant index: keyword_domain_idx');
            } catch (_error) {
               logger.info('[MIGRATION] keyword_domain_idx not found, skipping');
            }
         }

         if (domainTableExists) {
            try {
               await queryInterface.removeIndex('domain', 'domain_slug_idx', { transaction: t });
               logger.info('[MIGRATION] Removed redundant index: domain_slug_idx');
            } catch (_error) {
               logger.info('[MIGRATION] domain_slug_idx not found, skipping');
            }
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let keywordTableExists = false;
         let domainTableExists = false;

         try {
            await queryInterface.describeTable('keyword');
            keywordTableExists = true;
         } catch (_error) {
            // Table doesn't exist
         }

         try {
            await queryInterface.describeTable('domain');
            domainTableExists = true;
         } catch (_error) {
            // Table doesn't exist
         }

         if (keywordTableExists) {
            await queryInterface.addIndex('keyword', ['domain'], {
               name: 'keyword_domain_idx',
               transaction: t,
            });
         }

         if (domainTableExists) {
            await queryInterface.addIndex('domain', ['slug'], {
               name: 'domain_slug_idx',
               transaction: t,
            });
         }

         logger.info('[MIGRATION] Restored previously removed indexes.');
      });
   },
};
