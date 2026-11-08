// Migration: keyword position history keys were written as "YYYY-M-D" ("2026-1-5"). They are now "YYYY-MM-DD"
// (see utils/historyDateKey.ts). This rewrites the keys in history and history7d for every keyword row.

const { logger } = require('../migrationLogger');

const UNPADDED_DATE_KEY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

// Same rule as toHistoryDateKey in utils/historyDateKey.ts
const padDateKey = (key) => {
   const match = UNPADDED_DATE_KEY.exec(key);
   return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : key;
};

// Returns the history with padded keys. If a padded key already exists, that entry wins over the unpadded one.
const padHistoryDateKeys = (history) => {
   const result = {};
   for (const [key, value] of Object.entries(history)) {
      const padded = padDateKey(key);
      if (padded !== key && Object.prototype.hasOwnProperty.call(history, padded)) {
         continue;
      }
      result[padded] = value;
   }
   return result;
};

const parseHistory = (raw) => {
   if (typeof raw !== 'string' || raw.trim() === '') {
      return null;
   }
   try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
   } catch (_error) {
      return null;
   }
};

const rewriteRow = (raw) => {
   const parsed = parseHistory(raw);
   if (!parsed) {
      return null;
   }
   const padded = padHistoryDateKeys(parsed);
   const changed = Object.keys(padded).join('|') !== Object.keys(parsed).join('|');
   return changed ? JSON.stringify(padded) : null;
};

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping history date key padding - keyword table does not exist yet');
            return;
         }

         const keywordTableDefinition = await queryInterface.describeTable('keyword');
         if (!keywordTableDefinition?.history) {
            return;
         }

         const rows = await queryInterface.sequelize.query(
            'SELECT ID, history, history7d FROM keyword',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );

         let updatedCount = 0;
         for (const row of rows || []) {
            const newHistory = rewriteRow(row.history);
            const newHistory7d = rewriteRow(row.history7d);
            if (newHistory === null && newHistory7d === null) {
               continue;
            }
            await queryInterface.sequelize.query(
               'UPDATE keyword SET history = :history, history7d = :history7d WHERE ID = :id',
               {
                  transaction,
                  replacements: {
                     history: newHistory ?? row.history,
                     history7d: newHistory7d ?? row.history7d,
                     id: row.ID,
                  },
               }
            );
            updatedCount += 1;
         }

         logger.info(`[MIGRATION] Padded history date keys for ${updatedCount} keyword(s).`);
      });
   },

   // Data-only migration: the unpadded keys are not restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] History date key padding has no rollback.');
   },
};

// Exported for tests
module.exports.padHistoryDateKeys = padHistoryDateKeys;
