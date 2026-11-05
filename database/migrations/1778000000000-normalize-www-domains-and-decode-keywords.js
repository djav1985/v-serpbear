// Migration: the API now stores domains without a leading "www." and sends keywords/locations to scrapers exactly
// as stored (no decodeURIComponent). Bring existing rows in line:
//  - rename "www.example.com" to "example.com" (domain, slug and keyword.domain) unless that domain already exists
//  - decode keyword/location values that were saved percent-encoded (e.g. "best%20coffee")
// Rows that would collide with an existing row are left untouched and logged.

const fs = require('fs/promises');
const path = require('path');
const { logger } = require('../migrationLogger');

// Same rule as utils/domainSlug.ts (migrations run as plain Node, without TypeScript).
const toDomainSlug = (hostname) => hostname.replaceAll('-', '_').replaceAll('.', '-').replaceAll('/', '-');

const tableExists = async (sequelize, name, transaction) => {
   const [rows] = await sequelize.query(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=:name',
      { transaction, replacements: { name } }
   );
   return Boolean(rows && rows.length > 0);
};

// Only a value that is exactly what encodeURIComponent produces is decoded. A literal "50%25 off" decodes to
// "50% off", which re-encodes as "50%25%20off" (not the stored text), so it is kept as typed.
const decodeIfEncoded = (value) => {
   if (typeof value !== 'string' || !/%[0-9a-fA-F]{2}/.test(value)) return value;
   try {
      const decoded = decodeURIComponent(value);
      return encodeURIComponent(decoded) === value ? decoded : value;
   } catch (_error) {
      return value;
   }
};

// Per-domain data files are named after the domain (see utils/domainIdeasFile.ts and utils/searchConsole.ts).
const DATA_FILE_PREFIXES = ['IDEAS_', 'SC_'];
const dataFileName = (prefix, domain) => `${prefix}${domain.replace(/[^a-zA-Z0-9.\-_]/g, '_')}.json`;

const moveDataFileIfPresent = async (dataDir, fromName, toName) => {
   const from = path.join(dataDir, fromName);
   const to = path.join(dataDir, toName);
   try {
      await fs.access(from);
   } catch (_error) {
      return;
   }
   try {
      await fs.access(to);
      logger.info(`[MIGRATION] Kept ${fromName} - ${toName} already exists.`);
      return;
   } catch (_error) {
      // target is free
   }
   // eslint-disable-next-line security/detect-non-literal-fs-filename
   await fs.rename(from, to);
};

// Runs after the database transaction commits, so saved ideas and search-console data follow the renamed domain.
const moveDomainDataFiles = async (renames) => {
   const dataDir = path.resolve(process.cwd(), 'data');
   for (const { from, to } of renames) {
      for (const prefix of DATA_FILE_PREFIXES) {
         await moveDataFileIfPresent(dataDir, dataFileName(prefix, from), dataFileName(prefix, to));
      }
   }
};

module.exports = {
   up: async function up(params = {}) {
      const queryInterface = params?.context ?? params;
      const { sequelize } = queryInterface;
      const renames = [];

      await sequelize.transaction(async (transaction) => {
         if (await tableExists(sequelize, 'domain', transaction)) {
            const [domains] = await sequelize.query("SELECT ID, domain FROM domain WHERE domain LIKE 'www.%'", { transaction });
            let renamed = 0;
            for (const row of domains) {
               const bare = row.domain.slice(4);
               if (!bare.includes('.')) continue;
               const [existing] = await sequelize.query('SELECT ID FROM domain WHERE domain = :bare', { transaction, replacements: { bare } });
               if (existing.length > 0) {
                  logger.info(`[MIGRATION] Left ${row.domain} as is - ${bare} already exists.`);
                  continue;
               }
               await sequelize.query(
                  'UPDATE domain SET domain = :bare, slug = :slug WHERE ID = :id',
                  { transaction, replacements: { bare, slug: toDomainSlug(bare), id: row.ID } }
               );
               if (await tableExists(sequelize, 'keyword', transaction)) {
                  await sequelize.query('UPDATE keyword SET domain = :bare WHERE domain = :old', { transaction, replacements: { bare, old: row.domain } });
               }
               renames.push({ from: row.domain, to: bare });
               renamed += 1;
            }
            logger.info(`Removed the leading "www." from ${renamed} domain(s).`);
         }

         if (await tableExists(sequelize, 'keyword', transaction)) {
            const [keywords] = await sequelize.query(
               "SELECT ID, keyword, location FROM keyword WHERE keyword LIKE '%!%%' ESCAPE '!' OR location LIKE '%!%%' ESCAPE '!'",
               { transaction }
            );
            let decoded = 0;
            for (const row of keywords) {
               const keyword = decodeIfEncoded(row.keyword);
               const location = decodeIfEncoded(row.location);
               if (keyword === row.keyword && location === row.location) continue;
               try {
                  await sequelize.query(
                     'UPDATE keyword SET keyword = :keyword, location = :location WHERE ID = :id',
                     { transaction, replacements: { keyword, location, id: row.ID } }
                  );
                  decoded += 1;
               } catch (_error) {
                  logger.info(`[MIGRATION] Left keyword ${row.ID} as is - decoded value conflicts with an existing keyword.`);
               }
            }
            logger.info(`Decoded percent-encoded keyword/location values on ${decoded} keyword(s).`);
         }
      });

      await moveDomainDataFiles(renames);
   },

   // Data-only migration: renamed domains and decoded values are not restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] www/percent-decoding normalization has no rollback.');
   },
};

module.exports.toDomainSlug = toDomainSlug;
module.exports.decodeIfEncoded = decodeIfEncoded;
