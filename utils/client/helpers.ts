 
// Small values keep 3 significant digits (e.g. 1.23); larger values are grouped with no digits dropped (12,345).
export const formattedNum = (num:number) => new Intl.NumberFormat(
   'en-US',
   Math.abs(num) >= 1000 ? { maximumFractionDigits: 0 } : { maximumSignificantDigits: 3 },
).format(num);

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
