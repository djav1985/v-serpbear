// Migration: one keyword may be tracked once per target, where a target is domain + keyword + country +
// location + device. The API already refuses duplicates, but two overlapping requests (a double click) could
// both pass the check and insert the same keyword. A unique index makes the database enforce it.
//
// Existing duplicates are merged first, otherwise creating the index would fail:
//  - the row with the most position history is kept (the lowest ID wins a tie)
//  - tags of the removed rows are added to the kept row, and it stays starred if any duplicate was starred

const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

const INDEX_NAME = 'keyword_tracking_target_idx';

/**
 * @typedef {{ID: number, domain?: string | null, keyword?: string | null, country?: string | null, location?: string | null, device?: string | null, history?: string | null, tags?: string | null, sticky?: number | string | boolean}} KeywordRow
 */

/** @param {KeywordRow} row */
const targetKey = (row) => JSON.stringify([
   row.domain ?? '',
   row.keyword ?? '',
   row.country ?? '',
   row.location ?? '',
   row.device ?? '',
]);

/**
 * @template T
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {T | unknown}
 */
const parseJson = (raw, fallback) => {
   if (typeof raw !== 'string' || raw.trim() === '') { return fallback; }
   try {
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
   } catch (_error) {
      return fallback;
   }
};

/** @param {KeywordRow} row */
const historySize = (row) => {
   const history = parseJson(row.history, {});
   return history && typeof history === 'object' && !Array.isArray(history) ? Object.keys(history).length : 0;
};

/** @param {KeywordRow} row */
const tagList = (row) => {
   const tags = parseJson(row.tags, []);
   return Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [];
};

// Returns one entry per group of duplicate rows: which row to keep, which to delete, and what to carry over.
/** @param {KeywordRow[]} rows */
const planDuplicateRemovals = (rows) => {
   /** @type {Map<string, KeywordRow[]>} */
   const groups = new Map();
   for (const row of rows) {
      const key = targetKey(row);
      const existing = groups.get(key);
      if (existing) { existing.push(row); }
      else { groups.set(key, [row]); }
   }

   const plans = [];
   for (const group of groups.values()) {
      if (group.length < 2) { continue; }
      const ordered = [...group].sort((a, b) => (historySize(b) - historySize(a)) || (a.ID - b.ID));
      const [keep, ...removed] = ordered;

      const seen = new Set();
      /** @type {string[]} */
      const mergedTags = [];
      [keep, ...removed].forEach((row) => tagList(row).forEach((tag) => {
         const normalized = tag.toLowerCase();
         if (!seen.has(normalized)) {
            seen.add(normalized);
            mergedTags.push(tag);
         }
      }));

      plans.push({
         keepID: keep.ID,
         deleteIDs: removed.map((row) => row.ID),
         tags: mergedTags,
         tagsChanged: mergedTags.length !== tagList(keep).length,
         sticky: group.some((row) => Number(row.sticky) === 1),
         stickyChanged: Number(keep.sticky) !== 1 && group.some((row) => Number(row.sticky) === 1),
      });
   }
   return plans;
};

module.exports = {
   /**
    * @param {import('./migrationTypes').MigrationParams} [params={}]
    * @param {typeof import('sequelize')} [legacySequelize]
    */
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = /** @type {import('./migrationTypes').MigrationQueryInterface} */ (params.context ?? params);
      const SequelizeLib = /** @type {typeof import('sequelize')} */ (/** @type {unknown} */ (params.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize')));

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping unique keyword target index - keyword table does not exist yet');
            return;
         }

         /** @type {KeywordRow[]} */
         const rows = await queryInterface.sequelize.query(
            'SELECT ID, domain, keyword, country, location, device, history, tags, sticky FROM keyword',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );

         const plans = planDuplicateRemovals(rows || []);
         if (plans.length > 0) {
            // Keep a copy of the database file before any duplicate row is deleted
            await backupDatabaseFile(queryInterface);
         }

         let removed = 0;
         for (const plan of plans) {
            if (plan.tagsChanged || plan.stickyChanged) {
               await queryInterface.sequelize.query(
                  'UPDATE keyword SET tags = :tags, sticky = :sticky WHERE ID = :id',
                  {
                     transaction,
                     replacements: { tags: JSON.stringify(plan.tags), sticky: plan.sticky ? 1 : 0, id: plan.keepID },
                  }
               );
            }
            for (const id of plan.deleteIDs) {
               await queryInterface.sequelize.query('DELETE FROM keyword WHERE ID = :id', { transaction, replacements: { id } });
               removed += 1;
            }
         }
         if (removed > 0) {
            logger.info(`[MIGRATION] Merged ${removed} duplicate keyword row(s) before adding the unique target index.`);
         }

         // COALESCE so that a missing location (NULL) and an empty one count as the same target
         await queryInterface.sequelize.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME} ON keyword (domain, keyword, COALESCE(country, ''), COALESCE(location, ''), COALESCE(device, ''))`,
            { transaction }
         );
      });
   },

   /** @param {import('./migrationTypes').MigrationParams} [params={}] */
   down: async function down(params = {}) {
      const queryInterface = /** @type {import('./migrationTypes').MigrationQueryInterface} */ (params.context ?? params);
      return queryInterface.sequelize.transaction(async (transaction) => {
         await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`, { transaction });
      });
   },
};

// Exported for tests
module.exports.planDuplicateRemovals = planDuplicateRemovals;
