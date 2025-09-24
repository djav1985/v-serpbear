// Migration: Collapse keyword city/state metadata into a single location column.

const buildLocationString = (city, state, country) => {
   const normalize = (value) => typeof value === 'string' ? value.trim() : '';
   const parts = [normalize(city), normalize(state), normalize(country)].filter((part) => part.length > 0);
   return parts.join(',');
};

const parseLocationString = (location, fallbackCountry) => {
   const normalize = (value) => typeof value === 'string' ? value.trim() : '';
   const raw = normalize(location);
   const result = { city: '', state: '', country: normalize(fallbackCountry) };

   if (!raw) {
      return result;
   }

   const parts = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
   if (parts.length === 0) {
      return result;
   }

   let working = [...parts];
   const fallback = normalize(fallbackCountry);
   if (working.length > 0) {
      const candidateCountry = working[working.length - 1];
      if (!fallback || candidateCountry.toUpperCase() === fallback.toUpperCase()) {
         result.country = candidateCountry;
         working = working.slice(0, -1);
      }
   }

   if (working.length > 1) {
      result.state = working[working.length - 1];
      result.city = working.slice(0, -1).join(',');
   } else if (working.length === 1) {
      const value = working[0];
      if (/^[A-Z]{2,3}$/.test(value)) {
         result.state = value;
      } else {
         result.city = value;
      }
   }

   return result;
};

module.exports = {
   up: async function up(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const keywordTableDefinition = await queryInterface.describeTable('keyword');

         if (keywordTableDefinition?.city && !keywordTableDefinition?.location) {
            await queryInterface.renameColumn('keyword', 'city', 'location', { transaction });
         }

         const updatedDefinition = await queryInterface.describeTable('keyword');

         if (updatedDefinition?.location) {
            const keywords = await queryInterface.sequelize.query(
               'SELECT ID, location, state, country FROM keyword',
               { transaction, type: SequelizeLib.QueryTypes.SELECT }
            );

            if (Array.isArray(keywords)) {
               for (const keyword of keywords) {
                  const { ID, location, state, country } = keyword;
                  const newLocation = buildLocationString(location, state, country);
                  if (newLocation !== (location || '')) {
                     await queryInterface.sequelize.query(
                        'UPDATE keyword SET location = :location WHERE ID = :id',
                        { transaction, replacements: { location: newLocation, id: ID } }
                     );
                  }
               }
            }
         }

         const postBackfillDefinition = await queryInterface.describeTable('keyword');

         if (postBackfillDefinition?.state) {
            await queryInterface.removeColumn('keyword', 'state', { transaction });
         }

         if (postBackfillDefinition?.latlong) {
            await queryInterface.removeColumn('keyword', 'latlong', { transaction });
         }

         if (postBackfillDefinition?.settings) {
            await queryInterface.removeColumn('keyword', 'settings', { transaction });
         }

         console.log('Collapsed keyword city/state metadata into location column.');
      });
   },

   down: async function down(params = {}, legacySequelize) {
      const queryInterface = params?.context ?? params;
      const SequelizeLib = params?.Sequelize
         ?? legacySequelize
         ?? queryInterface?.sequelize?.constructor
         ?? require('sequelize');

      return queryInterface.sequelize.transaction(async (transaction) => {
         const keywordTableDefinition = await queryInterface.describeTable('keyword');

         if (!keywordTableDefinition?.state) {
            await queryInterface.addColumn(
               'keyword',
               'state',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: '' },
               { transaction }
            );
         }

         if (!keywordTableDefinition?.latlong) {
            await queryInterface.addColumn(
               'keyword',
               'latlong',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: '' },
               { transaction }
            );
         }

         if (!keywordTableDefinition?.settings) {
            await queryInterface.addColumn(
               'keyword',
               'settings',
               { type: SequelizeLib.DataTypes.STRING, allowNull: true, defaultValue: JSON.stringify({}) },
               { transaction }
            );
         }

         const refreshedDefinition = await queryInterface.describeTable('keyword');

         if (refreshedDefinition?.location) {
            await queryInterface.renameColumn('keyword', 'location', 'city', { transaction });
         }

         const keywords = await queryInterface.sequelize.query(
            'SELECT ID, city, country FROM keyword',
            { transaction, type: SequelizeLib.QueryTypes.SELECT }
         );

         if (Array.isArray(keywords)) {
            for (const keyword of keywords) {
               const { ID, city, country } = keyword;
               const parsed = parseLocationString(city, country);
               const updates = {
                  city: parsed.city || '',
                  state: parsed.state || '',
                  country: parsed.country || country || ''
               };

               await queryInterface.sequelize.query(
                  'UPDATE keyword SET city = :city, state = :state, country = :country WHERE ID = :id',
                  {
                     transaction,
                     replacements: {
                        id: ID,
                        city: updates.city,
                        state: updates.state,
                        country: updates.country
                     }
                  }
               );
            }
         }

         console.log('Restored keyword city/state columns from location.');
      });
   }
};
