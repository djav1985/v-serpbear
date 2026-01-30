/**
 * Converts a boolean value to SQLite integer (1 or 0)
 */
export const toDbBool = (value: boolean | number | null | undefined): 1 | 0 => value ? 1 : 0;

/**
 * Converts a SQLite integer (1 or 0) to boolean
 */
export const fromDbBool = (value: number | null | undefined): boolean => value === 1;

/**
 * Normalizes various value types to boolean.
 * Handles API responses, database values, and user inputs.
 * Uses a conservative approach: only explicitly recognized truthy values return true.
 * 
 * @param value - The value to normalize
 * @returns boolean representation
 * 
 * @example
 * normalizeToBoolean(1) // true (DB integer)
 * normalizeToBoolean('true') // true (API string)
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
      if (normalized === 'true' || normalized === '1') {
         return true;
      }
      // All other strings (including empty, 'false', '0', errors, etc.) return false
      return false;
   }

   // Null, undefined, and any other types return false (conservative approach)
   return false;
};
