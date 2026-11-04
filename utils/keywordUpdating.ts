/**
 * Helpers for the keyword `updating` flag.
 *
 * A run sets `updating` and `updatingStartedAt` together and clears both when it finishes. If the process
 * crashes mid-run the flag is never cleared, so a keyword would stay locked forever. A flag older than
 * STALE_UPDATING_MINUTES is therefore treated as belonging to a dead run and the keyword is free to refresh.
 */

export const STALE_UPDATING_MINUTES = 30;

type UpdatingFields = {
   updating?: unknown;
   updatingStartedAt?: string | null;
};

const isUpdatingFlagSet = (keyword: UpdatingFields): boolean => keyword.updating === 1 || keyword.updating === true;

/**
 * True when the keyword is flagged as updating but the flag is too old to belong to a live run.
 * A flag with a missing or unreadable start time cannot be proven live, so it counts as stale too.
 */
export const isUpdatingStale = (keyword: UpdatingFields, now: number = Date.now()): boolean => {
   if (!isUpdatingFlagSet(keyword)) {
      return false;
   }
   const startedAt = keyword.updatingStartedAt ? Date.parse(keyword.updatingStartedAt) : Number.NaN;
   if (Number.isNaN(startedAt)) {
      return true;
   }
   return now - startedAt > STALE_UPDATING_MINUTES * 60 * 1000;
};

/** True only when a live run is refreshing the keyword: flagged as updating and not stale. */
export const isKeywordUpdating = (keyword: UpdatingFields, now: number = Date.now()): boolean => (
   isUpdatingFlagSet(keyword) && !isUpdatingStale(keyword, now)
);
