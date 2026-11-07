'use client';

import type { ColumnDef, Row } from '@tanstack/react-table';
import { createSelectColumn } from 'app/(dashboard)/_components/data-table/select-column';
import type { DataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { formattedNum } from 'utils/client/helpers';
import { matchesCountry, matchesSearch, matchesTags } from 'utils/client/sortFilter';
import {
   BestCell, KeywordCell, PositionCell, RowActions, SearchConsoleCell, Sparkline, UpdatedCell, UrlCell,
} from './tracker-cells';

export type TrackerRow = KeywordType;
type TrackerColumn = ColumnDef<DataTableFeatures, TrackerRow>;

export type TrackerColumnConfig = {
   allowsCity: boolean;
   scPeriod: string;
   onOpenDetails: (keyword: KeywordType) => void;
   onRefresh: (keyword: KeywordType) => void;
   onToggleFavorite: (keyword: KeywordType) => void;
   onManageTags: (keyword: KeywordType) => void;
   onRemove: (keyword: KeywordType) => void;
};

// Unranked (0) sorts as 111 in both directions, so "Top Position" lists ranked keywords first and "Lowest" lists unranked first.
const UNRANKED_SORT_VALUE = 111;
const rankForSort = (position: number) => (position === 0 ? UNRANKED_SORT_VALUE : position);
const compareNumbers = (a: number, b: number) => (a === b ? 0 : (a > b ? 1 : -1));

type Compare = (a: TrackerRow, b: TrackerRow) => number;
const sortBy = (compare: Compare) => (a: Row<DataTableFeatures, TrackerRow>, b: Row<DataTableFeatures, TrackerRow>) => compare(a.original, b.original);

const scValue = (keyword: KeywordType, metric: 'impressions' | 'visits', period: string): number => (
   keyword.scData?.[metric]?.[period as keyof KeywordSCDataChild] || 0
);

/**
 * Every column of the Tracker table. Columns the user sees come first; the hidden ones exist only so the table can
 * filter and sort on them (device, country, tags, favorites, date added, Search Console totals).
 */
export const createTrackerColumns = (config: TrackerColumnConfig): TrackerColumn[] => [
   createSelectColumn<TrackerRow>((keyword) => keyword.keyword),
   {
      id: 'keyword',
      header: 'Keyword',
      accessorFn: (keyword) => keyword.keyword,
      meta: { width: 'minmax(12rem, 3fr)' },
      sortDescFirst: false,
      sortFn: sortBy((a, b) => a.keyword.localeCompare(b.keyword)),
      // The toolbar search box filters this column, case-insensitively.
      filterFn: (row, _columnId, value: string) => matchesSearch(row.original.keyword, value),
      cell: ({ row }) => (
         <KeywordCell
            keyword={row.original}
            allowsCity={config.allowsCity}
            onOpenDetails={config.onOpenDetails}
            onUnfavorite={config.onToggleFavorite}
         />
      ),
   },
   {
      id: 'position',
      header: 'Position',
      accessorFn: (keyword) => keyword.position,
      meta: { width: '6rem', cellClassName: 'justify-center text-center' },
      sortDescFirst: false,
      sortFn: sortBy((a, b) => compareNumbers(rankForSort(a.position), rankForSort(b.position))),
      cell: ({ row }) => <PositionCell keyword={row.original} />,
   },
   {
      id: 'best',
      header: 'Best',
      enableSorting: false,
      meta: { width: '4rem', cellClassName: 'justify-center text-center' },
      cell: ({ row }) => <BestCell keyword={row.original} />,
   },
   {
      id: 'history',
      header: 'History (7d)',
      enableSorting: false,
      meta: { width: '6rem' },
      cell: ({ row }) => <Sparkline history={row.original.history ?? {}} onClick={() => config.onOpenDetails(row.original)} />,
   },
   {
      id: 'volume',
      header: 'Volume',
      accessorFn: (keyword) => keyword.volume,
      meta: { width: '6rem', cellClassName: 'justify-center text-center' },
      sortDescFirst: true,
      sortFn: sortBy((a, b) => compareNumbers(a.volume, b.volume)),
      cell: ({ row }) => <span>{Number.isFinite(row.original.volume) ? formattedNum(row.original.volume) : '-'}</span>,
   },
   {
      id: 'url',
      header: 'URL',
      enableSorting: false,
      meta: { width: 'minmax(8rem, 2fr)' },
      cell: ({ row }) => <UrlCell keyword={row.original} />,
   },
   {
      id: 'updated',
      header: 'Updated',
      enableSorting: false,
      meta: { width: '8rem' },
      cell: ({ row }) => <UpdatedCell lastUpdated={row.original.lastUpdated} />,
   },
   {
      id: 'sc',
      header: () => (
         <div className="flex w-full justify-between text-center">
            <span className="min-w-10">Pos</span>
            <span className="min-w-10">Imp</span>
            <span className="min-w-10">Visits</span>
         </div>
      ),
      enableSorting: false,
      meta: { width: '11rem' },
      cell: ({ row }) => <SearchConsoleCell keyword={row.original} period={config.scPeriod} />,
   },
   {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      meta: { width: '2.5rem', cellClassName: 'justify-end' },
      cell: ({ row }) => (
         <RowActions
            keyword={row.original}
            onRefresh={config.onRefresh}
            onToggleFavorite={config.onToggleFavorite}
            onManageTags={config.onManageTags}
            onRemove={config.onRemove}
         />
      ),
   },
   // ── Hidden helper columns: filter and sort only ──
   {
      id: 'device',
      accessorFn: (keyword) => keyword.device,
      filterFn: 'equalsString',
   },
   {
      id: 'country',
      accessorFn: (keyword) => keyword.country,
      filterFn: (row, _columnId, value: string[]) => matchesCountry(row.original.country, value),
   },
   {
      id: 'tags',
      accessorFn: (keyword) => keyword.tags,
      filterFn: (row, _columnId, value: string[]) => matchesTags(row.original.tags ?? [], value),
   },
   {
      id: 'sticky',
      accessorFn: (keyword) => Boolean(keyword.sticky),
      sortDescFirst: true,
      sortFn: sortBy((a, b) => compareNumbers(Number(Boolean(a.sticky)), Number(Boolean(b.sticky)))),
   },
   {
      id: 'added',
      accessorFn: (keyword) => keyword.added,
      sortFn: sortBy((a, b) => compareNumbers(new Date(a.added).getTime(), new Date(b.added).getTime())),
   },
   {
      id: 'scImpressions',
      accessorFn: (keyword) => scValue(keyword, 'impressions', config.scPeriod),
      sortFn: sortBy((a, b) => compareNumbers(scValue(a, 'impressions', config.scPeriod), scValue(b, 'impressions', config.scPeriod))),
   },
   {
      id: 'scVisits',
      accessorFn: (keyword) => scValue(keyword, 'visits', config.scPeriod),
      sortFn: sortBy((a, b) => compareNumbers(scValue(a, 'visits', config.scPeriod), scValue(b, 'visits', config.scPeriod))),
   },
];
