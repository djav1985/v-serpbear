// Migration: Ensures camelCase boolean columns are authoritative and removes legacy snake_case boolean identifiers
const { logger } = require('../../utils/logger');

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib =
         params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');
            const domainTableDefinition = await queryInterface.describeTable('domain');

            const hasCamelKeywordFlag = Object.prototype.hasOwnProperty.call(keywordTableDefinition, 'mapPackTop3');
            const hasSnakeKeywordFlag = Object.prototype.hasOwnProperty.call(keywordTableDefinition, 'map_pack_top3');

            if (!hasCamelKeywordFlag && hasSnakeKeywordFlag) {
               await queryInterface.renameColumn('keyword', 'map_pack_top3', 'mapPackTop3', { transaction });
            } else if (hasCamelKeywordFlag && hasSnakeKeywordFlag) {
               await queryInterface.sequelize.query(
                  'UPDATE "keyword" SET "mapPackTop3" = COALESCE("map_pack_top3", "mapPackTop3")',
                  { transaction }
               );
               await queryInterface.removeColumn('keyword', 'map_pack_top3', { transaction });
            }

            const hasCamelDomainFlag = Object.prototype.hasOwnProperty.call(domainTableDefinition, 'scrapeEnabled');
            const hasSnakeDomainFlag = Object.prototype.hasOwnProperty.call(domainTableDefinition, 'scrape_enabled');

            if (!hasCamelDomainFlag && hasSnakeDomainFlag) {
               await queryInterface.renameColumn('domain', 'scrape_enabled', 'scrapeEnabled', { transaction });
            } else if (hasCamelDomainFlag && hasSnakeDomainFlag) {
               await queryInterface.sequelize.query(
                  'UPDATE "domain" SET "scrapeEnabled" = COALESCE("scrape_enabled", "scrapeEnabled")',
                  { transaction }
               );
               await queryInterface.removeColumn('domain', 'scrape_enabled', { transaction });
            }

            const keywordHasCamelAfterMigration =
               hasCamelKeywordFlag || (!hasCamelKeywordFlag && hasSnakeKeywordFlag);
            if (keywordHasCamelAfterMigration) {
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

            const domainHasCamelAfterMigration =
               hasCamelDomainFlag || (!hasCamelDomainFlag && hasSnakeDomainFlag);
            if (domainHasCamelAfterMigration) {
               await queryInterface.changeColumn(
                  'domain',
                  'scrapeEnabled',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: false,
                     defaultValue: true,
                  },
                  { transaction }
               );
            }
         } catch (error) {
            logger.error('Migration error:', error);
            throw error;
         }
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib =
         params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         try {
            const keywordTableDefinition = await queryInterface.describeTable('keyword');
            const domainTableDefinition = await queryInterface.describeTable('domain');

            const hasCamelKeywordFlag = Object.prototype.hasOwnProperty.call(keywordTableDefinition, 'mapPackTop3');
            const hasSnakeKeywordFlag = Object.prototype.hasOwnProperty.call(keywordTableDefinition, 'map_pack_top3');

            if (!hasSnakeKeywordFlag && hasCamelKeywordFlag) {
               await queryInterface.renameColumn('keyword', 'mapPackTop3', 'map_pack_top3', { transaction });
            } else if (hasSnakeKeywordFlag && hasCamelKeywordFlag) {
               await queryInterface.sequelize.query(
                  'UPDATE "keyword" SET "map_pack_top3" = COALESCE("mapPackTop3", "map_pack_top3")',
                  { transaction }
               );
               await queryInterface.removeColumn('keyword', 'mapPackTop3', { transaction });
            }

            const hasCamelDomainFlag = Object.prototype.hasOwnProperty.call(domainTableDefinition, 'scrapeEnabled');
            const hasSnakeDomainFlag = Object.prototype.hasOwnProperty.call(domainTableDefinition, 'scrape_enabled');

            if (!hasSnakeDomainFlag && hasCamelDomainFlag) {
               await queryInterface.renameColumn('domain', 'scrapeEnabled', 'scrape_enabled', { transaction });
            } else if (hasSnakeDomainFlag && hasCamelDomainFlag) {
               await queryInterface.sequelize.query(
                  'UPDATE "domain" SET "scrape_enabled" = COALESCE("scrapeEnabled", "scrape_enabled")',
                  { transaction }
               );
               await queryInterface.removeColumn('domain', 'scrapeEnabled', { transaction });
            }

            const keywordHasSnakeAfterRollback =
               hasSnakeKeywordFlag || (!hasSnakeKeywordFlag && hasCamelKeywordFlag);
            if (keywordHasSnakeAfterRollback) {
               await queryInterface.changeColumn(
                  'keyword',
                  'map_pack_top3',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: true,
                     defaultValue: false,
                  },
                  { transaction }
               );
            }

            const domainHasSnakeAfterRollback =
               hasSnakeDomainFlag || (!hasSnakeDomainFlag && hasCamelDomainFlag);
            if (domainHasSnakeAfterRollback) {
               await queryInterface.changeColumn(
                  'domain',
                  'scrape_enabled',
                  {
                     type: SequelizeLib.DataTypes.BOOLEAN,
                     allowNull: true,
                     defaultValue: true,
                  },
                  { transaction }
               );
            }
         } catch (error) {
            logger.error('Migration rollback error:', error);
            throw error;
         }
      });
   },
};
