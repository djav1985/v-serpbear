 
export const formattedNum = (num:number) => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(num);

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

/**
 * Filters keywords to get only selected and untracked items
 * @param keywords - Array of keywords with tracking status
 * @param selectedKeywordIds - Array of selected keyword UIDs
 * @returns Filtered array of keywords that are both selected and not tracked
 */
export const getSelectedUntrackedKeywords = <T extends { uid: string; isTracked: boolean }>(
   keywords: T[],
   selectedKeywordIds: string[]
): T[] => keywords.filter((keyword) => selectedKeywordIds.includes(keyword.uid) && !keyword.isTracked);
