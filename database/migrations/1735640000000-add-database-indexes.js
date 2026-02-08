// Migration: Add database indexes for better query performance

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            // Check if tables exist before adding indexes
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
            
            if (!keywordTableExists && !domainTableExists) {
               console.log('[MIGRATION] Skipping migration - keyword and domain tables do not exist yet');
               return;
            }

            if (keywordTableExists) {
               // Add index on keyword.domain for faster domain-based queries
               await queryInterface.addIndex('keyword', ['domain'], {
                  name: 'keyword_domain_idx',
                  transaction: t
               });

               // Add composite index for keyword + domain for uniqueness checks
               await queryInterface.addIndex('keyword', ['keyword', 'domain', 'device', 'country'], {
                  name: 'keyword_unique_combination_idx',
                  transaction: t
               });

               // Add index on keyword.lastUpdated for timestamp queries
               await queryInterface.addIndex('keyword', ['lastUpdated'], {
                  name: 'keyword_last_updated_idx',
                  transaction: t
               });

               // Add index on keyword.position for ranking queries
               await queryInterface.addIndex('keyword', ['position'], {
                  name: 'keyword_position_idx',
                  transaction: t
               });
            }

            if (domainTableExists) {
               // Add index on domain.slug for faster slug-based lookups
               await queryInterface.addIndex('domain', ['slug'], {
                  name: 'domain_slug_idx',
                  transaction: t
               });
            }

            console.log('[MIGRATION] Added database indexes for improved performance');
         } catch (error) {
            console.error('Migration error:', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;
      return queryInterface.sequelize.transaction(async (t) => {
         try {
            // Check if tables exist before removing indexes
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
            
            if (!keywordTableExists && !domainTableExists) {
               console.log('[MIGRATION] Skipping rollback - keyword and domain tables do not exist');
               return;
            }

            if (keywordTableExists) {
               await queryInterface.removeIndex('keyword', 'keyword_domain_idx', { transaction: t });
               await queryInterface.removeIndex('keyword', 'keyword_unique_combination_idx', { transaction: t });
               await queryInterface.removeIndex('keyword', 'keyword_last_updated_idx', { transaction: t });
               await queryInterface.removeIndex('keyword', 'keyword_position_idx', { transaction: t });
            }
            
            if (domainTableExists) {
               await queryInterface.removeIndex('domain', 'domain_slug_idx', { transaction: t });
            }
            
            console.log('[MIGRATION] Removed database indexes');
         } catch (error) {
            console.error('Migration rollback error:', error);
            throw error;
         }
      });
   },
};