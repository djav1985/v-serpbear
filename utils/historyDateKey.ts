import { APP_TIMEZONE, dateKeyInZone, dateKeyToTime } from './timezone';

/**
 * Date key for a keyword's position history, e.g. "2026-01-05": the calendar date in TZ, zero-padded.
 * Zero padding makes every key parse the same way and sort correctly as text. The history migration
 * (database/migrations/1773000000000-pad-history-date-keys.js) rewrites older unpadded keys ("2026-1-5") and
 * repeats this rule, because migrations run as plain Node without TypeScript; a test keeps the two in step.
 */
const pad = (value: number): string => String(value).padStart(2, '0');

export const toHistoryDateKey = (date: Date, timezone: string = APP_TIMEZONE): string => dateKeyInZone(date, timezone);

/**
 * Rewrites an older unpadded key ("2026-1-5") to the padded form ("2026-01-05"); any other key is returned as is.
 * Used when reading history, so installs that have not run the padding migration yet still line up.
 */
export const normalizeHistoryDateKey = (key: string): string => {
   const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
   return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}` : key;
};

/**
 * UTC midnight for a history key, used to order and compare the days the keys name.
 * new Date("2026-01-05") would also read UTC midnight, but only for padded keys; this accepts both forms.
 */
export const historyKeyToTime = (key: string): number => dateKeyToTime(key);

export default toHistoryDateKey;
