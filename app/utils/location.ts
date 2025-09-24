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
 * Validates that city and state are either provided together or omitted.
 */
export const hasValidCityStatePair = (city?: string, state?: string): boolean => {
   const trimmedCity = normalize(city);
   const trimmedState = normalize(state);
   const hasCity = trimmedCity.length > 0;
   const hasState = trimmedState.length > 0;
   return (hasCity && hasState) || (!hasCity && !hasState);
};

export const sameLocation = (
   a?: string | null,
   b?: string | null,
): boolean => {
   const normalizedA = formatLocation(parseLocation(a));
   const normalizedB = formatLocation(parseLocation(b));
   return normalizedA === normalizedB;
};
