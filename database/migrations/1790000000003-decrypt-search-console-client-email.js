// Migration: store the Search Console client email as plain text.
//
// The client email is a service account address, not a secret, so it is no longer encrypted. Older releases stored it
// encrypted, both in data/settings.json (search_console_client_email) and in each domain's search_console JSON
// (domain.search_console.client_email). This decrypts those values once. The private key stays encrypted.
//
// Idempotent: a value that is already plain text (it contains "@" or does not decrypt with SECRET) is left as it is,
// so running it again changes nothing. Without SECRET nothing can be decrypted and the migration does nothing.
// Before the first domain row is rewritten the database is backed up to <file>.bak-<date>.
// settings.json is copied to settings.json.bak-<date> before it is rewritten.
// Down encrypts the plain emails again, which releases before 6.5 need: they fail to read every global secret otherwise.

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

// Returns the encrypted email, or null when the value is empty or not a plain address (already encrypted).
/** @param {unknown} value @param {Cryptr} cryptr */
const encryptEmail = (value, cryptr) => (
   typeof value === 'string' && value.includes('@') ? cryptr.encrypt(value) : null
);

// Copies settings.json to settings.json.bak-<date>. A copy already made that day is kept: it is the older one.
/** @param {string} filePath */
const backupSettingsFile = (filePath) => {
   const now = new Date();
   const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
   try {
      fs.copyFileSync(filePath, `${filePath}.bak-${stamp}`, fs.constants.COPYFILE_EXCL);
   } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') { return; }
      logger.error(`[MIGRATION] Could not back up settings.json: ${error instanceof Error ? error.message : String(error)}`);
   }
};

// Rewrites search_console_client_email in data/settings.json. Returns true when the file was changed.
/** @param {Cryptr} cryptr @param {(value: unknown, cryptr: Cryptr) => string | null} convert */
const rewriteSettingsEmail = (cryptr, convert) => {
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
   const converted = convert(parsed.search_console_client_email, cryptr);
   if (converted === null) {
      return false;
   }
   backupSettingsFile(filePath);
   parsed.search_console_client_email = converted;
   // Write to a temp file and rename it over settings.json, so a crash or a concurrent reader never sees a partial file
   const tempPath = `${filePath}.${process.pid}.tmp`;
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 2), 'utf-8');
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   fs.renameSync(tempPath, filePath);
   return true;
};

// Returns the JSON text of search_console with a converted client_email, or null when the row must be left untouched.
/** @param {unknown} raw @param {Cryptr} cryptr @param {(value: unknown, cryptr: Cryptr) => string | null} convert */
const rewriteDomainEmail = (raw, cryptr, convert) => {
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
   const converted = convert(parsed.client_email, cryptr);
   if (converted === null) {
      return null;
   }
   return JSON.stringify({ ...parsed, client_email: converted });
};

/** @param {Cryptr} cryptr */
const decryptSettingsEmail = (cryptr) => rewriteSettingsEmail(cryptr, decryptEmail);
/** @param {unknown} raw @param {Cryptr} cryptr */
const decryptDomainEmail = (raw, cryptr) => rewriteDomainEmail(raw, cryptr, decryptEmail);
/** @param {unknown} raw @param {Cryptr} cryptr */
const encryptDomainEmail = (raw, cryptr) => rewriteDomainEmail(raw, cryptr, encryptEmail);

// Rewrites every domain row that convertRow changes. Returns the number of rows, or null when the column does not exist.
/**
 * @param {import('../migrationTypes').MigrationParams} params
 * @param {typeof import('sequelize') | undefined} legacySequelize
 * @param {(raw: unknown) => string | null} convertRow
 * @returns {Promise<number | null>}
 */
const rewriteDomainRows = async (params, legacySequelize, convertRow) => {
   const queryInterface = /** @type {import('../migrationTypes').MigrationQueryInterface} */ (params.context ?? params);
   if (!queryInterface?.sequelize) {
      return null;
   }
   const SequelizeLib = /** @type {typeof import('sequelize')} */ (/** @type {unknown} */ (params.Sequelize
      ?? legacySequelize
      ?? queryInterface.sequelize.constructor
      ?? require('sequelize')));

   return queryInterface.sequelize.transaction(async (transaction) => {
      const [tables] = await queryInterface.sequelize.query(
         "SELECT name FROM sqlite_master WHERE type='table' AND name='domain'",
         { transaction }
      );
      if (!tables || tables.length === 0) {
         logger.info('[MIGRATION] Skipping Search Console emails of domains - domain table does not exist yet');
         return null;
      }
      /** @type {Array<{name: string}>} */
      const columns = await queryInterface.sequelize.query('PRAGMA table_info(`domain`)', {
         transaction,
         type: SequelizeLib.QueryTypes.SELECT,
      });
      if (!Array.isArray(columns) || !columns.some((column) => column.name === 'search_console')) {
         logger.info('[MIGRATION] domain.search_console not found, skipping');
         return null;
      }

      /** @type {Array<{ID: number, search_console: string | null}>} */
      const rows = await queryInterface.sequelize.query(
         "SELECT ID, search_console FROM domain WHERE search_console IS NOT NULL AND search_console != ''",
         { transaction, type: SequelizeLib.QueryTypes.SELECT }
      );

      let backedUp = false;
      let updatedCount = 0;
      for (const row of rows) {
         const updated = convertRow(row.search_console);
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
      return updatedCount;
   });
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
      const updatedCount = await rewriteDomainRows(params, legacySequelize, (raw) => decryptDomainEmail(raw, cryptr));
      if (updatedCount !== null) {
         logger.info(`[MIGRATION] Stored the Search Console client email as plain text for ${updatedCount} domain(s).`);
      }
   },

   /**
    * @param {import('../migrationTypes').MigrationParams} [params={}]
    * @param {typeof import('sequelize')} [legacySequelize]
    */
   down: async function down(params = {}, legacySequelize) {
      // Going back without encrypting would make the older release read every global secret as empty
      if (!process.env.SECRET) {
         throw new Error('SECRET is required to encrypt the Search Console client email again.');
      }
      const cryptr = new Cryptr(process.env.SECRET);
      rewriteSettingsEmail(cryptr, encryptEmail);
      const updatedCount = await rewriteDomainRows(params, legacySequelize, (raw) => encryptDomainEmail(raw, cryptr));
      logger.info(`[MIGRATION] Encrypted the Search Console client email again (${updatedCount ?? 0} domain(s)).`);
   },
};

module.exports.decryptEmail = decryptEmail;
module.exports.decryptSettingsEmail = decryptSettingsEmail;
module.exports.decryptDomainEmail = decryptDomainEmail;
module.exports.encryptDomainEmail = encryptDomainEmail;
