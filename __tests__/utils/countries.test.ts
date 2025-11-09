import countries, { getGoogleDomain } from '../../utils/countries';

describe('countries utility', () => {
   describe('getGoogleDomain', () => {
      it('returns the google domain for a country with one', () => {
         expect(getGoogleDomain('US')).toBe('google.com');
         expect(getGoogleDomain('GB')).toBe('google.co.uk');
         expect(getGoogleDomain('FR')).toBe('google.fr');
      });

      it('returns google.com for countries without a google domain', () => {
         expect(getGoogleDomain('AI')).toBe('google.com'); // Anguilla has null
         expect(getGoogleDomain('AQ')).toBe('google.com'); // Antarctica has null
      });

      it('handles lowercase country codes', () => {
         expect(getGoogleDomain('us')).toBe('google.com');
         expect(getGoogleDomain('fr')).toBe('google.fr');
      });

      it('returns google.com for unknown country codes', () => {
         expect(getGoogleDomain('XX')).toBe('google.com');
         expect(getGoogleDomain('INVALID')).toBe('google.com');
      });
   });

   describe('countries data structure', () => {
      it('has googleDomain as 5th element in country array', () => {
         // Check a few countries
         expect(countries.US[4]).toBe('google.com');
         expect(countries.GB[4]).toBe('google.co.uk');
         expect(countries.AI[4]).toBe(null);
      });

      it('all countries have exactly 5 elements', () => {
         Object.keys(countries).forEach((code) => {
            expect(countries[code]).toHaveLength(5);
         });
      });

      it('googleDomain is either string or null', () => {
         Object.keys(countries).forEach((code) => {
            const googleDomain = countries[code][4];
            expect(googleDomain === null || typeof googleDomain === 'string').toBe(true);
         });
      });
   });
});
