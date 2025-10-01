/**
 * Resolves country code with fallback logic
 * @param {string} country - the country code to validate
 * @param {string[]} allowedCountries - array of allowed country codes (optional)
 * @param {string} fallback - fallback country code (defaults to 'US')
 * @returns {string} - resolved country code
 */
export const resolveCountryCode = (
   country: string = '', 
   allowedCountries?: string[], 
   fallback: string = 'US'
): string => {
   if (!country) {
      return fallback;
   }
   
   if (allowedCountries && allowedCountries.length > 0) {
      return allowedCountries.includes(country.toUpperCase()) ? country : fallback;
   }
   
   return country;
};