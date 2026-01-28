 
export const formattedNum = (num:number) => new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(num);

export { normalizeBooleanFlag } from '../boolean';

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
