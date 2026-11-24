// Migration: store the Search Console client email as plain text.
//
// The client email is a service account address, not a secret, so it is no longer encrypted. Older releases stored it
// encrypted, both in data/settings.json (search_console_client_email) and in each domain's search_console JSON
// (domain.search_console.client_email). This decrypts those values once. The private key stays encrypted.
//
// Idempotent: a value that is already plain text (it contains "@" or does not decrypt with SECRET) is left as it is,
// so running it again changes nothing. Without SECRET nothing can be decrypted and the migration does nothing.
// Before the first domain row is rewritten the database is backed up to <file>.bak-<date>.
// Down is a no-op: the email is not encrypted again.

const fs = require('fs');
const path = require('path');
const Cryptr = require('cryptr');
const { logger } = require('../migrationLogger');
const { backupDatabaseFile } = require('../backupDatabase');

const settingsPath = () => path.join(process.cwd(), 'data', 'settings.json');

// Returns the decrypted email, or null when the value is empty, already plain text, or cannot be decrypted.
/** @param {unknown} value @param {Cryptr} cryptr */
const decryptEmail = (value, cryptr) => {
   if (typeof value !== 'string' || value.trim() === '' || value.includes('@')) {
      return null;
   }
   try {
      const plain = cryptr.decrypt(value);
      return typeof plain === 'string' && plain.includes('@') ? plain : null;
   } catch (_error) {
      return null;
   }
};

// Rewrites data/settings.json when search_console_client_email is encrypted. Returns true when the file was changed.
/** @param {Cryptr} cryptr */
const decryptSettingsEmail = (cryptr) => {
   const filePath = settingsPath();
   let parsed;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
   } catch (_error) {
      return false;
   }
   if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
   }
   const plain = decryptEmail(parsed.search_console_client_email, cryptr);
   if (plain === null) {
      return false;
   }
   parsed.search_console_client_email = plain;
   // Write to a temp file and rename it over settings.json, so a crash or a concurrent reader never sees a partial file
   const tempPath = `${filePath}.${process.pid}.tmp`;
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2), 'utf-8');
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.renameSync(tempPath, filePath);
   return true;
};

// Returns the JSON text of search_console with a decrypted client_email, or null when the row must be left untouched.
/** @param {unknown} raw @param {Cryptr} cryptr */
const decryptDomainEmail = (raw, cryptr) => {
   if (typeof raw !== 'string' || raw.trim() === '') {
      return null;
   }
   let parsed;
   try {
      parsed = JSON.parse(raw);
   } catch (_error) {
      return null;
   }
   if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
   }
   const plain = decryptEmail(parsed.client_email, cryptr);
   if (plain === null) {
      return null;
   }
   return JSON.stringify({ ...parsed, client_email: plain });
};

module.exports = {
   /**
    * @param {import('../migrationTypes').MigrationParams} [params={}]
    * @param {typeof import('sequelize')} [legacySequelize]
    */
   up: async function up(params = {}, legacySequelize) {
      if (!process.env.SECRET) {
         logger.info('[MIGRATION] SECRET is not set, so the Search Console client email cannot be decrypted. Skipping.');
         return;
      }
      const cryptr = new Cryptr(process.env.SECRET);

      if (decryptSettingsEmail(cryptr)) {
         logger.info('[MIGRATION] Stored the global Search Console client email as plain text.');
      }

      const queryInterface = /** @type {import('../migrationTypes').MigrationQueryInterface} */ (params.context ?? params);
      if (!queryInterface?.sequelize) {
         return;
      }
      const SequelizeLib = /** @type {typeof import('sequelize')} */ (/** @type {unknown} */ (params.Sequelize
         ?? legacySequelize
         ?? queryInterface.sequelize.constructor
         ?? require('sequelize')));

      await queryInterface.sequelize.transaction(async (transaction) => {
         const [tables] = await queryInterface.sequelize.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
            { transaction }
         );
         if (!tables || tables.length === 0) {
            logger.info('[MIGRATION] Skipping Search Console email decryption - domain table does not exist yet');
            return;
         }
         /** @type {Array<{name: string}>} */
         const columns = await queryInterface.sequelize.query('PRAGMA table_info(`domain`)', {
            transaction,
            type: SequelizeLib.QueryTypes.SELECT,
         });
         if (!Array.isArray(columns) || !columns.some((column) => column.name === 'search_console')) {
            logger.info('[MIGRATION] domain.search_console not found, skipping');
            return;
         }

         /** @type {Array<{ID: number, search_console: string | null}>} */
         const rows = await queryInterface.sequelize.query(
            "SELECT ID, search_console FROM domain WHERE search_console IS NOT NULL AND search_console != ''",
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );

         let backedUp = false;
         let updatedCount = 0;
         for (const row of rows) {
            const updated = decryptDomainEmail(row.search_console, cryptr);
            if (updated === null) {
               continue;
            }
            if (!backedUp) {
               // Keep a consistent database snapshot before the first row is rewritten
               await backupDatabaseFile(queryInterface);
               backedUp = true;
            }
            await queryInterface.sequelize.query(
               'UPDATE domain SET search_console = :searchConsole WHERE ID = :id',
               { transaction, replacements: { searchConsole: updated, id: row.ID } }
            );
            updatedCount += 1;
         }
         logger.info(`[MIGRATION] Stored the Search Console client email as plain text for ${updatedCount} domain(s).`);
      });
   },

   // Data-only migration: the email is not encrypted again on rollback
   down: async function down() {
      logger.info('[MIGRATION] The Search Console client email is not encrypted again; nothing to roll back.');
   },
};

module.exports.decryptEmail = decryptEmail;
module.exports.decryptSettingsEmail = decryptSettingsEmail;
module.exports.decryptDomainEmail = decryptDomainEmail;
