const { logger } = require('../migrationLogger');

const REMOVED_SCRAPER_IDS = new Set(['proxy', 'scrapingant', 'scrapingrobot', 'spaceSerp']);

const parseScraperSettings = (rawValue) => {
   if (!rawValue) {
      return null;
   }

   if (typeof rawValue === 'object') {
      return rawValue;
   }

   try {
      return JSON.parse(rawValue);
   } catch (_error) {
      return null;
   }
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (t) => {
         let domainTableDefinition;
         try {
            domainTableDefinition = await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping remove-legacy-scraper-overrides - domain table does not exist yet');
            return;
         }

         if (!domainTableDefinition?.scraper_settings) {
            logger.info('[MIGRATION] domain.scraper_settings not found, skipping legacy scraper cleanup');
            return;
         }

         const [domains] = await queryInterface.sequelize.query(
            'SELECT ID, scraper_settings FROM domain WHERE scraper_settings IS NOT NULL',
            { transaction: t },
         );

         for (const row of domains) {
            const parsed = parseScraperSettings(row.scraper_settings);
            const scraperType = typeof parsed?.scraper_type === 'string' ? parsed.scraper_type.trim() : '';
            if (!REMOVED_SCRAPER_IDS.has(scraperType)) {
               continue;
            }

            await queryInterface.sequelize.query(
               'UPDATE domain SET scraper_settings = NULL WHERE ID = :id',
               { replacements: { id: row.ID }, transaction: t },
            );
         }
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async () => {
         try {
            await queryInterface.describeTable('domain');
         } catch (_describeError) {
            logger.info('[MIGRATION] Skipping rollback remove-legacy-scraper-overrides - domain table does not exist');
         }
      });
   },
};
