import { formatLocation, getLocationCountry, normalizeLocation, parseLocation } from '../../utils/location';

describe('getLocationCountry', () => {
   it('returns the country of a full city, state, country location', () => {
      expect(getLocationCountry('London,England,GB')).toBe('GB');
      expect(getLocationCountry('Austin,TX,US')).toBe('US');
   });

   it('treats a bare country code as the whole location', () => {
      expect(getLocationCountry('US')).toBe('US');
   });

   it('returns an empty string for empty, null or undefined locations', () => {
      expect(getLocationCountry('')).toBe('');
      expect(getLocationCountry('   ')).toBe('');
      expect(getLocationCountry(null)).toBe('');
      expect(getLocationCountry(undefined)).toBe('');
   });

   it('returns an empty string when the location has no known country', () => {
      expect(getLocationCountry('Austin,TX')).toBe('');
      expect(getLocationCountry('Austin')).toBe('');
      expect(getLocationCountry('Austin,TX,QX')).toBe('');
   });

   it('does not treat object prototype keys as countries', () => {
      expect(getLocationCountry('constructor')).toBe('');
      expect(getLocationCountry('toString')).toBe('');
   });
});

describe('location formatting helpers', () => {
   it('formats and parses a location round trip', () => {
      const location = formatLocation({ city: 'Austin', state: 'TX', country: 'US' });
      expect(location).toBe('Austin,TX,US');
      expect(parseLocation(location)).toEqual({ city: 'Austin', state: 'TX', country: 'US' });
   });
});

describe('normalizeLocation', () => {
   it('writes a country name in the last part as its code', () => {
      expect(normalizeLocation('Austin,TX,United States')).toBe('Austin,TX,US');
      expect(normalizeLocation('london,england,united kingdom')).toBe('london,england,GB');
   });

   it('turns a bare country name into its code', () => {
      expect(normalizeLocation('United States')).toBe('US');
   });

   it('leaves codes and other text as they are', () => {
      expect(normalizeLocation('Austin,TX,US')).toBe('Austin,TX,US');
      expect(normalizeLocation(' Austin , TX ')).toBe('Austin,TX');
      expect(normalizeLocation('')).toBe('');
      expect(normalizeLocation(null)).toBe('');
   });
});
