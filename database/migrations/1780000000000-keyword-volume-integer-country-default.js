// Migration: aligns the keyword table with the model.
//  - keyword.volume was created as VARCHAR (migration 1709217223856) but the model says INTEGER, so ORDER BY volume
//    sorted as text ("9" after "1200"). The column becomes INTEGER and stored values are cast to integers.
//  - keyword.country has DB default 'United States' (migration 1772000000000) while the model default is 'US'.
//    The DB default becomes 'US' so raw inserts that omit country store the same value as model inserts.
// Existing rows are not changed apart from the volume cast. SQLite cannot alter a column in place, so keyword is
// rebuilt with its columns, indexes and AUTOINCREMENT counter. Skipped when the table is already aligned.

const { logger } = require('../migrationLogger');

const COUNTRY_DEFAULT_SQL = "DEFAULT 'US'";

/** Returns what has to change given PRAGMA table_info rows, or null when nothing does. */
const planKeywordAlignment = (columns) => {
   const volume = columns.find((column) => column.name === 'volume');
   const country = columns.find((column) => column.name === 'country');
   const volumeNeedsInteger = Boolean(volume) && !/^INT/i.test(String(volume.type || ''));
   const countryNeedsDefault = Boolean(country) && country.dflt_value !== "'US'";
   if (!volumeNeedsInteger && !countryNeedsDefault) {
      return null;
   }
   return { volumeNeedsInteger, countryNeedsDefault };
};

/** Rewrites the CREATE TABLE statement of keyword into keyword_rebuild with the requested column changes. */
const buildRebuildSql = (createSql, plan) => {
   let sql = createSql.replace(/^CREATE TABLE\s+["`]?keyword["`]?/i, 'CREATE TABLE `keyword_rebuild`');
   if (plan.volumeNeedsInteger) {
      sql = sql.replace(/(["`]?)volume\1\s+[A-Za-z]+(\(\d+\))?/, '`volume` INTEGER');
   }
   if (plan.countryNeedsDefault) {
      sql = sql.replace(/(["`]?)country\1\s+([A-Za-z]+(?:\(\d+\))?)\s+DEFAULT\s+'[^']*'/, `\`country\` $2 ${COUNTRY_DEFAULT_SQL}`);
   }
   return sql;
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;
      const { sequelize } = queryInterface;

      return sequelize.transaction(async (transaction) => {
         const [tables] = await sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction },
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping keyword volume/country alignment - keyword table does not exist yet');
            return;
         }

         const columns = await sequelize.query('PRAGMA table_info(`keyword`)', { transaction, type: sequelize.QueryTypes.SELECT });
         const plan = planKeywordAlignment(columns);
         if (!plan) {
            logger.info('[MIGRATION] keyword.volume and keyword.country already match the model');
            return;
         }

         const [tableRows] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='keyword'", { transaction });
         const indexRows = await sequelize.query(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='keyword' AND sql IS NOT NULL",
            { transaction, type: sequelize.QueryTypes.SELECT },
         );
         const sequenceRows = await sequelize.query(
            "SELECT seq FROM sqlite_sequence WHERE name='keyword'",
            { transaction, type: sequelize.QueryTypes.SELECT },
         );

         const columnList = columns.map((column) => `\`${column.name}\``).join(', ');
         const selectList = columns
            .map((column) => (plan.volumeNeedsInteger && column.name === 'volume'
               ? 'CAST(COALESCE(CAST(`volume` AS REAL), 0) AS INTEGER)'
               : `\`${column.name}\``))
            .join(', ');

         await sequelize.query('DROP TABLE IF EXISTS `keyword_rebuild`', { transaction });
         await sequelize.query(buildRebuildSql(tableRows[0].sql, plan), { transaction });
         await sequelize.query(`INSERT INTO \`keyword_rebuild\` (${columnList}) SELECT ${selectList} FROM \`keyword\``, { transaction });
         await sequelize.query('DROP TABLE `keyword`', { transaction });
         await sequelize.query('ALTER TABLE `keyword_rebuild` RENAME TO `keyword`', { transaction });

         // Keep the AUTOINCREMENT counter so deleted IDs are not reused
         if (sequenceRows.length > 0) {
            await sequelize.query(
               'UPDATE sqlite_sequence SET seq = :seq WHERE name = :name',
               { transaction, replacements: { seq: sequenceRows[0].seq, name: 'keyword' } },
            );
         }
         for (const { sql } of indexRows) {
            await sequelize.query(sql, { transaction });
         }

         logger.info('[MIGRATION] Aligned keyword.volume (INTEGER) and keyword.country default (US) with the model.');
      });
   },

   // Data-only alignment: the previous column types are not restored.
   down: async function down() {
      logger.info('[MIGRATION] keyword volume/country alignment has no rollback.');
   },
};

module.exports.planKeywordAlignment = planKeywordAlignment;
module.exports.buildRebuildSql = buildRebuildSql;
