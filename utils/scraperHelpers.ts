import countries from './countries';

/**
 * Resolves country code with fallback logic
 * @param {string} country - the country code to validate
 * @param {string[]} allowedCountries - array of allowed country codes (optional)
 * @param {string} fallback - fallback country code (defaults to 'US')
 * @returns {string} - resolved country code
 */
const isSupportedCountry = (code: string): boolean => {
   const countryInfo = countries[code];
   return Boolean(countryInfo && countryInfo[0] && countryInfo[0] !== 'Unknown');
};

export const resolveCountryCode = (
   country: string = '',
   allowedCountries?: string[],
   fallback: string = 'US'
): string => {
   const normalizedFallback = (fallback || 'US').toUpperCase();
   const fallbackIsValid = isSupportedCountry(normalizedFallback);
   const safeFallback = fallbackIsValid ? normalizedFallback : 'US';

   const hasAllowedCountries = Array.isArray(allowedCountries) && allowedCountries.length > 0;
   const normalizedAllowed = hasAllowedCountries
      ? new Set(allowedCountries.map((code) => code.toUpperCase()))
      : null;

   const normalizedCountry = (country || '').toUpperCase();
   const countryIsValid = Boolean(normalizedCountry && isSupportedCountry(normalizedCountry));

   if (countryIsValid && (!normalizedAllowed || normalizedAllowed.has(normalizedCountry))) {
      // Return uppercase country code for consistent lookup in countries object
      return normalizedCountry;
   }

   if (normalizedAllowed?.has(safeFallback)) {
      return safeFallback;
   }

   if (normalizedAllowed) {
      for (const code of normalizedAllowed) {
         if (isSupportedCountry(code)) {
            return code;
         }
      }
   }

   return safeFallback;
};

// The keyword's stored location ("City,State,Country Name") as one value, or [] for country-only keywords.
// Scrapers send it as-is when present and skip the location parameter when it is empty; the country still comes from the country column.
export const getKeywordLocationParts = (location?: string | null): string[] => {
  if (typeof location !== "string") return [];
  const trimmed = location.trim();
  if (!trimmed) return [];
  return [trimmed];
};

const ACCOUNT_CALL_TIMEOUT_MS = 10000;

/**
 * Reads a provider's account endpoint as JSON. Returns null on any failure (network, timeout, non-2xx,
 * invalid JSON) so a credit lookup can never break a refresh.
 */
export const fetchAccountJson = async (url: string, headers: Record<string, string> = {}): Promise<unknown | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ACCOUNT_CALL_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", headers: { Accept: "application/json", ...headers }, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** A finite number from a number or numeric string, otherwise null. */
export const toCreditNumber = (value: unknown): number | null => {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};
