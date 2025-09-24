 
export const formattedNum = (num:number) => new Intl.NumberFormat('en-IN', { maximumSignificantDigits: 3 }).format(num);

export const normaliseBooleanFlag = (value: unknown): boolean => {
   if (typeof value === 'boolean') {
      return value;
   }

   if (typeof value === 'number') {
      return value !== 0;
   }

   if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '' || trimmed === '0' || trimmed === 'false' || trimmed === 'no' || trimmed === 'off') {
         return false;
      }

      if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes' || trimmed === 'on') {
         return true;
      }
      return false;
   }

   return Boolean(value);
};
