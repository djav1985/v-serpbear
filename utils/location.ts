import countries from './countries';

export type LocationParts = {
   city?: string,
   state?: string,
   country?: string,
};

const normalize = (value?: string | null): string => {
   if (typeof value !== 'string') { return ''; }
   return value.trim();
};

/**
 * Formats individual location parts into a single comma separated string.
 */
export const formatLocation = ({ city, state, country }: LocationParts): string => {
   const parts = [normalize(city), normalize(state), normalize(country)].filter((part) => part.length > 0);
   return parts.join(',');
};

/**
 * Parses the comma separated location string into individual parts.
 * Accepts a fallback country (ISO code) for legacy compatibility.
 */
export const parseLocation = (location?: string | null, fallbackCountry?: string): LocationParts => {
   const parts = typeof location === 'string'
      ? location.split(',').map((part) => part.trim()).filter((part) => part.length > 0)
      : [];

   if (parts.length === 0) {
      const fallback = normalize(fallbackCountry);
      return fallback ? { country: fallback } : {};
   }

   const fallback = normalize(fallbackCountry);
   let working = [...parts];
   let country = fallback;

   if (working.length > 0) {
      const candidateCountry = working[working.length - 1];
      const shouldUseCandidate = working.length > 2
         || !country
         || candidateCountry.toUpperCase() === country.toUpperCase();
      if (shouldUseCandidate) {
         country = candidateCountry;
         working = working.slice(0, -1);
      }
   }

   let city = '';
   let state = '';

   if (working.length > 1) {
      state = working[working.length - 1];
      city = working.slice(0, -1).join(',');
   } else if (working.length === 1) {
      const value = working[0];
      if (/^[A-Z]{2,3}$/.test(value)) {
         state = value;
      } else {
         city = value;
      }
   }

   const result: LocationParts = {};
   if (city) { result.city = city; }
   if (state) { result.state = state; }
   if (country) { result.country = country; }

   return result;
};

/**
 * Country name for an ISO code, e.g. "US" -> "United States". Returns '' for unknown codes.
 */
export const getCountryName = (countryCode?: string | null): string => {
   const code = normalize(countryCode);
   return Array.isArray(countries[code]) ? countries[code][0] : '';
};

/**
 * Reverse lookup of getCountryName, case-insensitive. Returns '' when no country has that name.
 */
export const getCountryCodeByName = (countryName?: string | null): string => {
   const name = normalize(countryName).toLowerCase();
   if (!name) { return ''; }
   const code = Object.keys(countries).find((key) => Array.isArray(countries[key]) && countries[key][0].toLowerCase() === name);
   return code || '';
};

/**
 * Returns the known ISO country code a location belongs to, or '' when there is none.
 * The last part may be a country code ("US") or a country name ("United States").
 */
export const getLocationCountry = (location?: string | null): string => {
   const parts = (normalize(location)).split(',').map((part) => normalize(part)).filter((part) => part.length > 0);
   // A country is only read from the last part of a single value or a City,State,Country value.
   // Two parts are City,State, so a state code such as GA is never taken as a country.
   if (parts.length !== 1 && parts.length < 3) { return ''; }
   const lastPart = parts[parts.length - 1] || '';
   if (Array.isArray(countries[lastPart])) { return lastPart; }
   return getCountryCodeByName(lastPart);
};

/**
 * Stored keyword location: "City,State,Country Name" for city-level keywords.
 * Country-only keywords store '' because their country lives in the country column.
 * City and state must be given together, so a single one returns ''.
 */
export const buildStoredLocation = ({ city, state, countryCode }: { city?: string, state?: string, countryCode?: string }): string => {
   const trimmedCity = normalize(city);
   const trimmedState = normalize(state);
   if (!trimmedCity || !trimmedState) { return ''; }
   return formatLocation({ city: trimmedCity, state: trimmedState, country: getCountryName(countryCode) });
};

/**
 * Validates that city and state are either provided together or omitted.
 */
export const hasValidCityStatePair = (city?: string, state?: string): boolean => {
   const trimmedCity = normalize(city);
   const trimmedState = normalize(state);
   const hasCity = trimmedCity.length > 0;
   const hasState = trimmedState.length > 0;
   return (hasCity && hasState) || (!hasCity && !hasState);
};


/**
 * A location with no comma that names a country (code or name) is country-only, e.g. "US" or "United States".
 */
export const isCountryOnlyLocation = (location?: string | null): boolean => {
  const trimmed = normalize(location);
  return trimmed !== '' && !trimmed.includes(',') && getLocationCountry(trimmed) !== '';
};

/**
 * City and state typed by a user. Unlike parseLocation, a single value stays a city, so a
 * missing state can be rejected instead of being read as a country.
 */
export const parseCityState = (location?: string | null): { city: string, state: string } => {
  const trimmed = normalize(location);
  if (!trimmed || isCountryOnlyLocation(trimmed)) { return { city: '', state: '' }; }
  const parts = trimmed.split(',').map((part) => normalize(part)).filter((part) => part.length > 0);
  const cityAndState = parts.length >= 3 && getLocationCountry(trimmed) ? parts.slice(0, -1) : parts;
  if (cityAndState.length === 1) { return { city: cityAndState[0], state: '' }; }
  return { city: cityAndState.slice(0, -1).join(','), state: cityAndState[cityAndState.length - 1] };
};
