/**
 * Date key for a keyword's position history, e.g. "2026-01-05" (local calendar date, zero-padded).
 * Zero padding makes every key parse the same way and sort correctly as text. The history migration
 * (database/migrations/1773000000000-pad-history-date-keys.js) rewrites older unpadded keys ("2026-1-5") and
 * repeats this rule, because migrations run as plain Node without TypeScript; a test keeps the two in step.
 */
const pad = (value: number): string => String(value).padStart(2, '0');

export const toHistoryDateKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Rewrites an older unpadded key ("2026-1-5") to the padded form ("2026-01-05"); any other key is returned as is.
 * Used when reading history, so installs that have not run the padding migration yet still line up.
 */
export const normalizeHistoryDateKey = (key: string): string => {
   const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
   return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}` : key;
};

/**
 * Local midnight for a history key, so comparisons match the calendar days the keys name.
 * new Date("2026-01-05") would read the key as UTC midnight, which can shift it to the previous day.
 */
export const historyKeyToTime = (key: string): number => {
   const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
   if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
   }
   return new Date(key).getTime();
};

export default toHistoryDateKey;
