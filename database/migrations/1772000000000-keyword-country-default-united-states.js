// Migration: keyword.country defaults to 'United States', and locations written with a bare or
// trailing "US" are changed to "United States".
// SQLite cannot change a column default in place, so keyword is rebuilt with its original
// columns, indexes and AUTOINCREMENT counter.

const { logger } = require('../migrationLogger');

const OLD_COUNTRY_DEFAULT = "DEFAULT 'US'";
const NEW_COUNTRY_DEFAULT = "DEFAULT 'United States'";

const rebuildKeywordTable = async (queryInterface, transaction, countryDefault) => {
   const [tableRows] = await queryInterface.sequelize.query(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='keyword'",
      { transaction },
   );
   const createSql = tableRows[0].sql;
   const indexRows = await queryInterface.sequelize.query(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='keyword' AND sql IS NOT NULL",
      { transaction, type: queryInterface.sequelize.QueryTypes.SELECT },
   );
   const sequenceRows = await queryInterface.sequelize.query(
      "SELECT seq FROM sqlite_sequence WHERE name='keyword'",
      { transaction, type: queryInterface.sequelize.QueryTypes.SELECT },
   );

   // SQLite stores the name in double quotes after a rename, so accept either quote style
   const newCreateSql = createSql
      .replace(/^CREATE TABLE\s+["`]?keyword["`]?/, 'CREATE TABLE `keyword_rebuild`')
      .replace(/`country` VARCHAR\(255\) DEFAULT '[^']*'/, `\`country\` VARCHAR(255) ${countryDefault}`);

   await queryInterface.sequelize.query(newCreateSql, { transaction });
   await queryInterface.sequelize.query('INSERT INTO `keyword_rebuild` SELECT * FROM `keyword`', { transaction });
   await queryInterface.sequelize.query('DROP TABLE `keyword`', { transaction });
   await queryInterface.sequelize.query('ALTER TABLE `keyword_rebuild` RENAME TO `keyword`', { transaction });

   // Keep the AUTOINCREMENT counter so deleted IDs are not reused
   if (sequenceRows.length > 0) {
      await queryInterface.sequelize.query(
         'UPDATE sqlite_sequence SET seq = :seq WHERE name = :name',
         { transaction, replacements: { seq: sequenceRows[0].seq, name: 'keyword' } },
      );
   }

   for (const { sql } of indexRows) {
      await queryInterface.sequelize.query(sql, { transaction });
   }
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction },
         );
         if (tables.length === 0) {
            logger.info('[MIGRATION] Skipping migration - keyword table does not exist yet');
            return;
         }

         await rebuildKeywordTable(queryInterface, transaction, NEW_COUNTRY_DEFAULT);

         // A bare country code, and a code at the end of "City,State,CC", become the full name
         await queryInterface.sequelize.query(
            "UPDATE keyword SET location = 'United States' WHERE location = 'US'",
            { transaction },
         );
         await queryInterface.sequelize.query(
            "UPDATE keyword SET location = substr(location, 1, length(location) - 2) || 'United States' WHERE location LIKE '%,US'",
            { transaction },
         );

         logger.info('[MIGRATION] Set keyword.country default to United States and updated US locations.');
      });
   },

   down: async function down(params = {}) {
      const queryInterface = params?.context ?? params;

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction },
         );
         if (tables.length === 0) { return; }

         // Restores the old default only. Location text is not changed back, since
         // "United States" cannot be told apart from a name that was already there.
         await rebuildKeywordTable(queryInterface, transaction, OLD_COUNTRY_DEFAULT);
         logger.info('[MIGRATION] Restored keyword.country default to US.');
      });
   },
};
