// Migration: Add hot-path indexes to keyword table to support frequent filter patterns.
// Adds indexes on keyword(updating) and keyword(domain, updating) which appear in
// refresh/list codepaths and are not covered by the existing indexes.

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let keywordTableExists = false;
         try {
            await queryInterface.describeTable('keyword');
            keywordTableExists = true;
         } catch (_error) {
            // Table doesn't exist yet
         }

         if (!keywordTableExists) {
            console.log('[MIGRATION] Skipping migration - keyword table does not exist yet');
            return;
         }

         // Index on keyword.updating for queries that filter by updating flag
         await queryInterface.addIndex('keyword', ['updating'], {
            name: 'keyword_updating_idx',
            transaction: t,
         });

         // Compound index on (domain, updating) for the frequent pattern
         // WHERE domain = ? AND updating = ?
         await queryInterface.addIndex('keyword', ['domain', 'updating'], {
            name: 'keyword_domain_updating_idx',
            transaction: t,
         });

         console.log('[MIGRATION] Added keyword hotpath indexes.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let keywordTableExists = false;
         try {
            await queryInterface.describeTable('keyword');
            keywordTableExists = true;
         } catch (_error) {
            // Table doesn't exist
         }

         if (!keywordTableExists) {
            console.log('[MIGRATION] Skipping rollback - keyword table does not exist');
            return;
         }

         await queryInterface.removeIndex('keyword', 'keyword_updating_idx', { transaction: t });
         await queryInterface.removeIndex('keyword', 'keyword_domain_updating_idx', { transaction: t });

         console.log('[MIGRATION] Removed keyword hotpath indexes.');
      });
   },
};
