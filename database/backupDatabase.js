/* eslint-disable security/detect-non-literal-fs-filename -- the path is the configured SQLite storage file, not user input */
// Backs up the SQLite database to <file>.bak-<YYYY-MM-DD> before a destructive migration step.
// Plain CommonJS because migrations run as plain Node. Never throws: a failed backup logs a warning and returns null.

const fs = require('fs');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');
const { logger } = require('./migrationLogger');

const pad = (value) => String(value).padStart(2, '0');

// Local calendar date, e.g. 2026-11-04
const todayStamp = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const backupDatabaseFile = async (queryInterface, now = new Date()) => {
   try {
      const storage = queryInterface?.sequelize?.options?.storage;
      if (typeof storage !== 'string' || storage.trim() === '' || storage === ':memory:') {
         return null;
      }

      const sourcePath = path.resolve(storage);
      if (!fs.existsSync(sourcePath)) {
         return null;
      }

      const backupPath = `${sourcePath}.bak-${todayStamp(now)}`;
      if (fs.existsSync(backupPath)) {
         return null;
      }

      const database = new BetterSqlite3(sourcePath, { readonly: true, fileMustExist: true });
      try {
         await database.backup(backupPath);
      } finally {
         database.close();
      }
      logger.info(`[MIGRATION] Backed up database to ${backupPath}`);
      return backupPath;
   } catch (error) {
      logger.warn(`[MIGRATION] Could not back up database before migrating: ${error instanceof Error ? error.message : String(error)}`);
      return null;
   }
};

module.exports = { backupDatabaseFile };
