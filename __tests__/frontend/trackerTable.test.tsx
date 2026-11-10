import { renderHook } from '@testing-library/react';
import { useTable } from '@tanstack/react-table';
import { dataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { createTrackerColumns } from 'app/(dashboard)/domain/[slug]/_components/tracker-columns';
import { DEFAULT_FILTERS, SORT_CHOICES, STICKY_FIRST, TrackerFilters, choiceForSorting, sortingForChoice, toColumnFilters } from 'app/(dashboard)/domain/[slug]/_components/tracker-state';
import { NO_TAGS_FILTER } from 'utils/client/sortFilter';

describe('Tracker table', () => {
  // The Tracker's sort and filter rules live in its column definitions. These tests drive the real columns through a real
  // table, so they cover what the screen does, not a copy of it.

  const noop = () => undefined;
  const columns = (scPeriod = 'threeDays') => createTrackerColumns({
     allowsCity: false, scPeriod, onOpenDetails: noop, onRefresh: noop, onToggleFavorite: noop, onManageTags: noop, onRemove: noop,
  });

  const keyword = (ID: number, overrides: Partial<KeywordType> = {}): KeywordType => ({
     ID, keyword: `kw ${ID}`, device: 'desktop', country: 'US', domain: 'example.com', lastUpdated: '2026-01-01', added: `2026-01-0${ID}`,
     position: ID, volume: 0, sticky: false, history: {}, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false,
     ...overrides,
  } as KeywordType);

  type Options = { sort?: string; filters?: Partial<TrackerFilters>; scPeriod?: string; withFavoritesFirst?: boolean };

  /** IDs of the rows the table would show, in order. Favorites-first is what the screen always adds ahead of the chosen sort. */
  const idsFor = (data: KeywordType[], { sort = 'date_asc', filters = {}, scPeriod, withFavoritesFirst = true }: Options = {}): number[] => {
     const sorting = withFavoritesFirst ? [STICKY_FIRST, ...sortingForChoice(sort)] : sortingForChoice(sort);
     const { result } = renderHook(() => useTable({
        features: dataTableFeatures,
        data,
        columns: columns(scPeriod),
        getRowId: (row) => String(row.ID),
        state: { sorting, columnFilters: toColumnFilters({ ...DEFAULT_FILTERS, ...filters }) },
     }));
     return result.current.getRowModel().rows.map((row) => row.original.ID);
  };

  describe('Tracker sorting', () => {
     it('shows favorites first, whatever the chosen sort is', () => {
        const data = [keyword(1), keyword(2, { sticky: true }), keyword(3), keyword(4, { sticky: true })];

        expect(idsFor(data, { sort: 'date_asc' })).toEqual([2, 4, 1, 3]);
        expect(idsFor(data, { sort: 'date_desc' })).toEqual([4, 2, 3, 1]);
        expect(idsFor(data, { sort: 'date_asc', withFavoritesFirst: false })).toEqual([1, 2, 3, 4]);
     });

     it('sorts by position with unranked keywords (0) after the ranked ones, and first on "Lowest Position"', () => {
        const data = [keyword(1, { position: 5 }), keyword(2, { position: 0 }), keyword(3, { position: 1 }), keyword(4, { position: 20 })];

        expect(idsFor(data, { sort: 'pos_asc' })).toEqual([3, 1, 4, 2]);
        expect(idsFor(data, { sort: 'pos_desc' })).toEqual([2, 4, 1, 3]);
     });

     it('sorts by date added, alphabetically, and by search volume', () => {
        const data = [
           keyword(1, { keyword: 'banana', added: '2026-03-01', volume: 50 }),
           keyword(2, { keyword: 'Apple', added: '2026-01-01', volume: 900 }),
           keyword(3, { keyword: 'cherry', added: '2026-02-01', volume: 10 }),
        ];

        expect(idsFor(data, { sort: 'date_asc' })).toEqual([2, 3, 1]);
        expect(idsFor(data, { sort: 'date_desc' })).toEqual([1, 3, 2]);
        expect(idsFor(data, { sort: 'alpha_asc' })).toEqual([2, 1, 3]);
        expect(idsFor(data, { sort: 'alpha_desc' })).toEqual([3, 1, 2]);
        expect(idsFor(data, { sort: 'vol_desc' })).toEqual([2, 1, 3]);
        expect(idsFor(data, { sort: 'vol_asc' })).toEqual([3, 1, 2]);
     });

     it('sorts by the Search Console impressions and visits of the selected period', () => {
        const sc = (impressions: number, visits: number, period = 'threeDays') => ({
           impressions: { [period]: impressions }, visits: { [period]: visits }, ctr: {}, position: {},
        }) as unknown as KeywordSCData;
        const data = [keyword(1, { scData: sc(10, 9) }), keyword(2, { scData: sc(500, 1) }), keyword(3), keyword(4, { scData: sc(60, 40) })];

        expect(idsFor(data, { sort: 'imp_desc' })).toEqual([2, 4, 1, 3]);
        expect(idsFor(data, { sort: 'imp_asc' })).toEqual([3, 1, 4, 2]);
        expect(idsFor(data, { sort: 'visits_desc' })).toEqual([4, 1, 2, 3]);
        // A keyword with no data for the chosen period counts as 0.
        expect(idsFor(data, { sort: 'imp_desc', scPeriod: 'sevenDays' })).toEqual([1, 2, 3, 4]);
     });

     it('maps every sort choice to table sorting and back, and falls back to the default for an unknown choice', () => {
        SORT_CHOICES.forEach((choice) => expect(choiceForSorting([STICKY_FIRST, ...sortingForChoice(choice.value)])).toBe(choice.value));
        expect(sortingForChoice('nope')).toEqual(sortingForChoice('date_asc'));
        expect(choiceForSorting([{ id: 'url', desc: false }])).toBe('');
     });
  });

  describe('Tracker filtering', () => {
     const data = [
        keyword(1, { device: 'desktop', country: 'US', tags: ['seo'] }),
        keyword(2, { device: 'mobile', country: 'US', tags: ['seo', 'local'] }),
        keyword(3, { device: 'desktop', country: 'CA', tags: [], keyword: 'Maple Syrup' }),
        keyword(4, { device: 'desktop', country: 'US', tags: ['local'] }),
     ];

     it('shows one device at a time', () => {
        expect(idsFor(data, { filters: { device: 'desktop' } })).toEqual([1, 3, 4]);
        expect(idsFor(data, { filters: { device: 'mobile' } })).toEqual([2]);
     });

     it('filters by country, and an empty country list means all', () => {
        expect(idsFor(data, { filters: { countries: ['CA'] } })).toEqual([3]);
        expect(idsFor(data, { filters: { countries: [] } })).toEqual([1, 3, 4]);
     });

     it('filters by tag, and "No Tags" matches only keywords without tags', () => {
        expect(idsFor(data, { filters: { tags: ['local'] } })).toEqual([4]);
        expect(idsFor(data, { filters: { tags: [NO_TAGS_FILTER] } })).toEqual([3]);
     });

     it('filters by search text without caring about case', () => {
        expect(idsFor(data, { filters: { search: 'maple' } })).toEqual([3]);
        expect(idsFor(data, { filters: { search: 'nothing like this' } })).toEqual([]);
     });
  });
});
