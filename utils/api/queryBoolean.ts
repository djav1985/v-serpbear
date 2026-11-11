import { parseBooleanStrict } from '../dbBooleans';

/**
 * Parses a query parameter as a strict boolean value.
 * Accepts case-insensitive: true/false/1/0/on/off/yes/no.
 * Returns null for absent param (param not present); returns `{ ok: false, message }` for unknown or empty values.
 */
export const parseStrictBooleanQueryParam = (
   value: string | string[] | undefined,
): { ok: true; value: boolean } | { ok: false; message: string } | null => {
   if (value === undefined) { return null; }
   const raw = Array.isArray(value)
      ? (value.length > 0 ? value[value.length - 1] : '')
      : value;
   const lower = raw.trim().toLowerCase();
   if (lower === '') {
      return { ok: false, message: 'Boolean query parameter must not be empty' };
   }
   const parsed = parseBooleanStrict(lower);
   if (parsed !== null) { return { ok: true, value: parsed }; }
   return { ok: false, message: `Invalid boolean value: "${raw}". Expected one of: true, false, 1, 0, on, off, yes, no` };
};
