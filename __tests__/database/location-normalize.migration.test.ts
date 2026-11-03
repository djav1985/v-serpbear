/** @jest-environment node */

export {};

// The migration is plain JS and is run by sequelize-cli, so its transform is checked directly here
const { normalizeLocation } = require('../../database/migrations/1770200000000-normalize-keyword-location-country.js');

describe('keyword location normalization migration', () => {
   it('writes a trailing country code as the full name', () => {
      expect(normalizeLocation('Port Charlotte,Florida,US', 'US')).toBe('Port Charlotte,Florida,United States');
   });

   it('keeps commas inside the city name', () => {
      expect(normalizeLocation('Washington,D.C.,District of Columbia,US', 'US'))
         .toBe('Washington,D.C.,District of Columbia,United States');
   });

   it('keeps a city with commas when the country is already a name', () => {
      expect(normalizeLocation('Washington,D.C.,District of Columbia,United States', 'US'))
         .toBe('Washington,D.C.,District of Columbia,United States');
   });

   it('clears country-only values', () => {
      expect(normalizeLocation('US', 'US')).toBe('');
      expect(normalizeLocation('UNITED STATES', 'US')).toBe('');
      expect(normalizeLocation('', 'US')).toBe('');
   });

   it('returns blank when only a city is left', () => {
      expect(normalizeLocation('Miami,US', 'US')).toBe('');
   });

   it('canonicalizes a country name typed in any case', () => {
      expect(normalizeLocation('Port Charlotte,Florida,UNITED STATES', 'US')).toBe('Port Charlotte,Florida,United States');
   });
});
