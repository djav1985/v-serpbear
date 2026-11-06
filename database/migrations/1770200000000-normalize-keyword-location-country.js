// Migration: Keyword location stores "City,State,Country Name" for city-level keywords and a blank
// location for country-only keywords. The country code lives only in the country column.

const { logger } = require('../migrationLogger');
const countryNames = require('../countryNames.json');

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const toCountryName = (countryCode) => (countryCode && countryNames[countryCode]) || '';

// Canonical country name for a value typed in any case, e.g. "UNITED STATES" -> "United States"
const findCountryName = (value) => {
   const lower = value.toLowerCase();
   return Object.values(countryNames).find((name) => name.toLowerCase() === lower) || '';
};

// Returns the normalized location for one keyword row, or '' for country-only rows.
const normalizeLocation = (location, rowCountry) => {
   const parts = (typeof location === 'string' ? location : '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

   // Single values are a bare country code or name, which means country-only
   if (parts.length === 0 || parts.length === 1) {
      return '';
   }

   // A trailing country code ("US") or name ("UNITED STATES", any case) is dropped and replaced by the canonical name
   const lastPart = parts[parts.length - 1];
   const trailingCode = COUNTRY_CODE_PATTERN.test(lastPart) && countryNames[lastPart] ? lastPart : '';
   const trailingName = trailingCode ? '' : findCountryName(lastPart);
   const cityAndState = trailingCode || trailingName ? parts.slice(0, -1) : parts;

   // A city may contain commas (e.g. "Washington,D.C."), so everything before the state is kept as the city
   if (cityAndState.length < 2) {
      return '';
   }

   const countryName = toCountryName(rowCountry) || trailingName || toCountryName(trailingCode);
   return countryName ? [...cityAndState, countryName].join(',') : cityAndState.join(',');
};

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         let keywordTableDefinition;
         try {
            keywordTableDefinition = await queryInterface.describeTable('keyword');
         } catch (_describeError) {
            // Table doesn't exist yet - skip migration
            logger.info('[MIGRATION] Skipping keyword location normalization - keyword table does not exist yet');
            return;
         }

         if (!keywordTableDefinition?.location) {
            return;
         }

         const keywords = await queryInterface.sequelize.query(
            'SELECT ID, location, country FROM keyword',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );

         let updatedCount = 0;
         for (const keyword of keywords || []) {
            const current = typeof keyword.location === 'string' ? keyword.location : '';
            const normalized = normalizeLocation(current, keyword.country);
            if (normalized !== current.trim()) {
               await queryInterface.sequelize.query(
                  'UPDATE keyword SET location = :location WHERE ID = :id',
                  { transaction, replacements: { location: normalized, id: keyword.ID } }
               );
               updatedCount += 1;
            }
         }

         logger.info(`Normalized keyword locations to City,State,Country Name for ${updatedCount} keyword(s).`);
      });
   },

   // Data-only migration: the previous mixed formats are not restored on rollback
   down: async function down() {
      logger.info('[MIGRATION] Keyword location normalization has no rollback.');
   },
};

// Exported for tests
module.exports.normalizeLocation = normalizeLocation;
