import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';

export type TrackerDevice = 'desktop' | 'mobile';

export type TrackerFilters = {
   device: TrackerDevice;
   countries: string[];
   tags: string[];
   search: string;
};

export const DEFAULT_FILTERS: TrackerFilters = { device: 'desktop', countries: [], tags: [], search: '' };

/** Favorites always come first. The hidden `sticky` column is sorted descending ahead of whatever the user picks. */
export const STICKY_FIRST: SortingState[number] = { id: 'sticky', desc: true };

export type SortChoice = { value: string; label: string; sorting: SortingState; searchConsoleOnly?: boolean };

/** The same sort choices the legacy Tracker offered, expressed as table sorting state. */
export const SORT_CHOICES: SortChoice[] = [
   { value: 'pos_asc', label: 'Top Position', sorting: [{ id: 'position', desc: false }] },
   { value: 'pos_desc', label: 'Lowest Position', sorting: [{ id: 'position', desc: true }] },
   // Oldest first by added date is the default.
   { value: 'date_asc', label: 'Oldest (Default)', sorting: [{ id: 'added', desc: false }] },
   { value: 'date_desc', label: 'Most Recent', sorting: [{ id: 'added', desc: true }] },
   { value: 'alpha_asc', label: 'Alphabetically (A-Z)', sorting: [{ id: 'keyword', desc: false }] },
   { value: 'alpha_desc', label: 'Alphabetically (Z-A)', sorting: [{ id: 'keyword', desc: true }] },
   { value: 'vol_asc', label: 'Lowest Search Volume', sorting: [{ id: 'volume', desc: false }] },
   { value: 'vol_desc', label: 'Highest Search Volume', sorting: [{ id: 'volume', desc: true }] },
   { value: 'imp_desc', label: 'Most Viewed', sorting: [{ id: 'scImpressions', desc: true }], searchConsoleOnly: true },
   { value: 'imp_asc', label: 'Least Viewed', sorting: [{ id: 'scImpressions', desc: false }], searchConsoleOnly: true },
   { value: 'visits_desc', label: 'Most Visited', sorting: [{ id: 'scVisits', desc: true }], searchConsoleOnly: true },
   { value: 'visits_asc', label: 'Least Visited', sorting: [{ id: 'scVisits', desc: false }], searchConsoleOnly: true },
];

export const DEFAULT_SORT_CHOICE = 'date_asc';

export const sortingForChoice = (value: string): SortingState => (
   SORT_CHOICES.find((choice) => choice.value === value)?.sorting ?? SORT_CHOICES.find((c) => c.value === DEFAULT_SORT_CHOICE)!.sorting
);

/** The choice that matches the current sorting, or '' after a header click that is not one of the listed choices. */
export const choiceForSorting = (sorting: SortingState): string => {
   const user = sorting.filter((entry) => entry.id !== STICKY_FIRST.id);
   return SORT_CHOICES.find((choice) => (
      choice.sorting.length === user.length && choice.sorting.every((entry, i) => entry.id === user[i].id && entry.desc === user[i].desc)
   ))?.value ?? '';
};

/** Search Console periods, in the order the legacy picker listed them. */
export const SC_PERIODS: { value: string; label: string }[] = [
   { value: 'threeDays', label: 'Last Three Days' },
   { value: 'sevenDays', label: 'Last Seven Days' },
   { value: 'thirtyDays', label: 'Last Thirty Days' },
   { value: 'avgThreeDays', label: 'Last Three Days Avg' },
   { value: 'avgSevenDays', label: 'Last Seven Days Avg' },
   { value: 'avgThirtyDays', label: 'Last Thirty Days Avg' },
];
export const DEFAULT_SC_PERIOD = 'threeDays';

/** Optional columns the user can switch off. The others are locked on. */
export const OPTIONAL_COLUMNS = ['Best', 'History', 'Volume', 'Search Console'] as const;
export const LOCKED_COLUMNS = ['Keyword', 'Position', 'URL', 'Updated'] as const;

export const toColumnFilters = (filters: TrackerFilters): ColumnFiltersState => [
   { id: 'device', value: filters.device },
   { id: 'country', value: filters.countries },
   { id: 'tags', value: filters.tags },
   { id: 'keyword', value: filters.search },
];
