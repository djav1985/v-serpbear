import { historyKeyToTime } from './historyDateKey';

// A local (map pack) result as built by each scraper from its own response, in the order Google shows them.
export type LocalResultItem = {
   position: number;
   title: string;
   url?: string;
   /** True when this entry is the tracked business (a top-3 title equal to business_name). Set by markOwnLocalResults. */
   isOwn?: boolean;
};

// Compares names the way a person would: case, spacing (including non-breaking spaces), "&" vs "and" and
// punctuation such as commas, dashes or curly quotes do not make two names different.
const normaliseName = (value: string | null | undefined): string => (value ?? '')
   .normalize('NFKC')
   .normalize('NFD')
   .replace(/[̀-ͯ]/g, '')
   .toLowerCase()
   .replace(/&/g, ' and ')
   .replace(/[^\p{L}\p{N}]+/gu, ' ')
   .trim();

// Flags the local result that is the tracked business, using the same rule as computeMapPackTop3: only the first
// three entries can match, by title equal to business_name (ignoring case). Every entry gets an explicit isOwn.
export const markOwnLocalResults = <T extends { title?: string }>(
   localResults: T[] | null | undefined,
   businessName?: string | null,
): Array<T & { isOwn: boolean }> => {
   const name = normaliseName(businessName);
   return (Array.isArray(localResults) ? localResults : []).map((entry, index) => ({
      ...entry,
      isOwn: !!name && index < 3 && normaliseName(entry.title) === name,
   }));
};

// Map pack is matched by business name only: one of the first three local results must have a title
// equal to the domain's business_name (ignoring case).
export const computeMapPackTop3 = (
   localResults: LocalResultItem[] | null | undefined,
   businessName?: string | null,
): boolean => {
   const name = normaliseName(businessName);
   if (!name || !Array.isArray(localResults) || localResults.length === 0) {
      return false;
   }

   return localResults
      .slice(0, 3)
      .some((entry) => normaliseName(entry.title) === name);
};

/** Days a keyword keeps its "dropped out of the map pack" date before the date is cleared. */
export const MAP_PACK_REMOVED_DAYS = 30;

type MapPackRemovalInput = {
   /** The stored mapPackTop3 flag before this scrape */
   wasInMapPack: boolean;
   /** Whether this scrape found the keyword in the map pack top three */
   isInMapPack: boolean;
   /** The stored mapPackRemovedAt (YYYY-MM-DD) */
   removedAt?: string | null;
   /** Today's date key in TZ */
   todayKey: string;
   /** Whether the scraper returns map pack data at all */
   supportsMapPack: boolean;
};

/**
 * The mapPackRemovedAt value to store after a successful scrape:
 * - a scraper without map pack data changes nothing (its flag is always false, so it says nothing about removal).
 * - in the map pack: the date is cleared.
 * - dropped out now (flag was true): the date is today.
 * - already out with a date: the date is kept, and cleared once it is more than 30 days old.
 */
export const nextMapPackRemovedAt = (input: MapPackRemovalInput): string | null => {
   const current = typeof input.removedAt === 'string' && input.removedAt ? input.removedAt : null;
   if (!input.supportsMapPack) { return current; }
   if (input.isInMapPack) { return null; }
   if (input.wasInMapPack) { return input.todayKey; }
   if (!current) { return null; }
   const ageDays = (historyKeyToTime(input.todayKey) - historyKeyToTime(current)) / 86400000;
   // An unreadable date is cleared as well, so it cannot stay forever
   return Number.isNaN(ageDays) || ageDays > MAP_PACK_REMOVED_DAYS ? null : current;
};
