/**
 * Converts a value to a SQLite boolean integer (1 or 0), using the same rules as normalizeToBoolean.
 */
export const toDbBool = (value: unknown): 1 | 0 => (normalizeToBoolean(value) ? 1 : 0);

/**
 * Converts a SQLite integer (1 or 0) to boolean, using the same rules as normalizeToBoolean.
 */
export const fromDbBool = (value: unknown): boolean => normalizeToBoolean(value);

/**
 * Normalizes various value types to boolean.
 * Handles API responses, database values, and user inputs.
 * Uses a conservative approach: only explicitly recognized truthy values return true.
 * 
 * @param value - The value to normalize
 * @returns boolean representation
 * 
 * Recognized truthy values:
 *  - boolean `true`
 *  - non-zero numbers (e.g. `1`)
 *  - strings (case-insensitive, trimmed): `'true'`, `'1'`, `'yes'`, `'on'`
 * All other values (including `false`, `0`, `'false'`, `'0'`, `'no'`, `'off'`,
 * unrecognized strings, `null`, `undefined`, objects, arrays) return `false`.
 * 
 * @example
 * normalizeToBoolean(1) // true (DB integer)
 * normalizeToBoolean('true') // true (API string)
 * normalizeToBoolean('yes') // true
 * normalizeToBoolean('0') // false (string number)
 * normalizeToBoolean('error') // false (unrecognized string)
 * normalizeToBoolean(null) // false (null/undefined)
 */
export const normalizeToBoolean = (value: unknown): boolean => {
   // Handle boolean directly
   if (typeof value === 'boolean') {
      return value;
   }

   // Handle numbers (DB integers: 1 = true, 0 = false)
   if (typeof value === 'number') {
      return value !== 0;
   }

   // Handle strings (API responses, user input)
   if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      // Only explicitly recognized truthy strings return true
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
         return true;
      }
      // All other strings (including empty, 'false', '0', 'no', 'off', errors, etc.) return false
      return false;
   }

   // Null, undefined, and any other types return false (conservative approach)
   return false;
};

const FALSE_STRINGS = new Set(['false', '0', 'no', 'off']);

/**
 * Strict boolean parser for query parameters: returns true/false for the recognized words
 * (true/1/yes/on and false/0/no/off, case-insensitive) and null for anything else, including an empty string.
 */
export const parseBooleanStrict = (value: string): boolean | null => {
   const normalized = value.trim().toLowerCase();
   if (normalizeToBoolean(normalized)) { return true; }
   return FALSE_STRINGS.has(normalized) ? false : null;
};

/**
 * Reads an on/off environment flag. An unset, empty or unrecognized value gives defaultValue;
 * 'disabled' counts as off in addition to the usual false words.
 */
export const parseEnvFlag = (value: string | undefined, defaultValue = true): boolean => {
   const normalized = (value ?? '').trim().toLowerCase();
   if (normalized === 'disabled') { return false; }
   return parseBooleanStrict(normalized) ?? defaultValue;
};
