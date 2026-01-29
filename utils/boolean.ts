const TRUE_STRINGS = new Set(['1', 'true', 'yes', 'on']);
const FALSE_STRINGS = new Set(['0', 'false', 'no', 'off', '']);

export const normalizeBooleanFlag = (value: unknown): boolean => {
   if (typeof value === 'boolean') {
      return value;
   }

   if (typeof value === 'number') {
      return !Number.isNaN(value) && value !== 0;
   }

   if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (TRUE_STRINGS.has(trimmed)) {
         return true;
      }
      if (FALSE_STRINGS.has(trimmed)) {
         return false;
      }
      return false;
   }

   return Boolean(value);
};
