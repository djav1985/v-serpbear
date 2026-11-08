'use client';

import { useMemo } from 'react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Star } from 'lucide-react';
import { Checkbox } from 'components/ui/checkbox';
import { cn } from 'lib/utils';
import { formattedNum } from 'utils/client/helpers';
import { matchesIdeaTags, matchesSearch } from 'utils/client/sortFilter';
import countries from 'utils/countries';
import type { DataTableFeatures } from '../data-table/features';
import type { IdeaRow } from './ideas-state';

type IdeaColumn = ColumnDef<DataTableFeatures, IdeaRow>;

export type IdeaColumnConfig = {
   favoriteIds: Set<string>;
   onOpenDetails: (idea: IdeaRow) => void;
   onToggleFavorite: (idea: IdeaRow) => void;
};

const compare = (a: number, b: number) => (a === b ? 0 : (a > b ? 1 : -1));
type R = Row<DataTableFeatures, IdeaRow>;

const COMPETITION_STYLE: Record<string, string> = {
   LOW: 'bg-emerald-600',
   MEDIUM: 'bg-amber-500',
   HIGH: 'bg-red-500',
};

/** Monthly volumes as a small line. Higher is better, so a rising line goes up. */
export function VolumeSparkline({ volumes, onClick, large = false }: { volumes: Record<string, string>; onClick?: () => void; large?: boolean }) {
   const points = useMemo(() => {
      const series = Object.keys(volumes ?? {}).map((key) => parseInt(volumes[key], 10)).filter((v) => Number.isFinite(v));
      if (series.length === 0) { return null; }
      const low = Math.min(...series);
      const span = Math.max(...series) - low;
      return series.map((value, index) => {
         const x = 3 + (index / Math.max(series.length - 1, 1)) * 74;
         const y = span === 0 ? 12 : 21 - ((value - low) / span) * 18;
         return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
   }, [volumes]);
   if (!points) { return null; }
   return (
      <button type="button" aria-label="Open the search volume trend" onClick={onClick}>
         <svg width={large ? 150 : 80} height={large ? 45 : 24} viewBox="0 0 80 24" role="img" aria-label="Monthly search volume">
            <polyline fill="none" stroke="var(--primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" points={points} />
         </svg>
      </button>
   );
}

export function CompetitionBadge({ idea }: { idea: IdeaKeyword }) {
   return (
      <div className="bg-muted flex w-28 overflow-hidden rounded text-xs font-semibold" data-competition={idea.competition}>
         <span className="flex-1 p-1 text-center">{idea.competitionIndex}/100</span>
         <span className={cn('flex-1 p-1 text-center text-white', COMPETITION_STYLE[idea.competition] ?? 'bg-muted-foreground')}>{idea.competition}</span>
      </div>
   );
}

export function IdeaSelectCheckbox({ row }: { row: R }) {
   const tracked = row.original.isTracked;
   return (
      <Checkbox
         aria-label={tracked ? 'Keyword already tracked' : `Select ${row.original.keyword}`}
         title={tracked ? 'Already in Tracker' : undefined}
         disabled={tracked}
         checked={row.getIsSelected()}
         onCheckedChange={(value) => row.toggleSelected(value === true)}
         onClick={(event) => event.stopPropagation()}
      />
   );
}

/** `starAtEnd` pushes the favorite star to the right edge, as the stacked mobile row does. */
export function IdeaKeywordCell({ idea, favorite, config, starAtEnd = false }: { idea: IdeaRow; favorite: boolean; config: IdeaColumnConfig; starAtEnd?: boolean }) {
   return (
      <div className="flex min-w-0 items-center gap-2">
         <span className={`fflag fflag-${idea.country} h-[12px] w-[18px] shrink-0`} title={countries[idea.country]?.[0] ?? idea.country} />
         <button type="button" className={cn('hover:text-primary min-w-0 truncate text-left font-medium', starAtEnd && 'flex-1')} title={idea.keyword} onClick={() => config.onOpenDetails(idea)}>
            {idea.keyword}
         </button>
         <button
            type="button"
            aria-label={favorite ? 'Unfavorite keyword idea' : 'Favorite keyword idea'}
            className={cn('shrink-0', !favorite && 'opacity-50 hover:opacity-100')}
            onClick={() => config.onToggleFavorite(idea)}
         >
            <Star className={cn('size-4', favorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
         </button>
      </div>
   );
}

/** Columns of the Ideas table, for the Research page and for a domain's Ideas page. */
export const createIdeaColumns = (config: IdeaColumnConfig): IdeaColumn[] => [
   {
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      meta: { width: '1.5rem' },
      header: ({ table }) => {
         // Only ideas that are not tracked yet can be selected, so select-all covers exactly those that match the filters.
         const addable = table.getFilteredRowModel().rows.filter((row) => !row.original.isTracked);
         const selected = addable.filter((row) => row.getIsSelected()).length;
         return (
            <Checkbox
               aria-label="Select all keyword ideas that can be added"
               disabled={addable.length === 0}
               checked={addable.length > 0 && selected === addable.length ? true : (selected > 0 ? 'indeterminate' : false)}
               onCheckedChange={(value) => table.setRowSelection(value === true ? Object.fromEntries(addable.map((row) => [row.id, true])) : {})}
            />
         );
      },
      cell: ({ row }) => <IdeaSelectCheckbox row={row} />,
   },
   {
      id: 'keyword',
      header: 'Keyword',
      accessorFn: (idea) => idea.keyword,
      meta: { width: 'minmax(12rem, 3fr)' },
      sortDescFirst: false,
      sortFn: (a: R, b: R) => a.original.keyword.toLowerCase().localeCompare(b.original.keyword.toLowerCase()),
      filterFn: (row, _columnId, value: string) => matchesSearch(row.original.keyword, value),
      cell: ({ row }) => <IdeaKeywordCell idea={row.original} favorite={config.favoriteIds.has(row.original.uid)} config={config} />,
   },
   {
      id: 'volume',
      header: 'Monthly Search',
      accessorFn: (idea) => idea.avgMonthlySearches ?? 0,
      meta: { width: '8rem', cellClassName: 'justify-center text-center' },
      sortDescFirst: true,
      sortFn: (a: R, b: R) => compare(a.original.avgMonthlySearches ?? 0, b.original.avgMonthlySearches ?? 0),
      cell: ({ row }) => <span>{formattedNum(row.original.avgMonthlySearches ?? 0)}</span>,
   },
   {
      id: 'trend',
      header: 'Search Trend',
      enableSorting: false,
      meta: { width: '6rem', cellClassName: 'justify-center' },
      cell: ({ row }) => <VolumeSparkline volumes={row.original.monthlySearchVolumes} onClick={() => config.onOpenDetails(row.original)} />,
   },
   {
      id: 'competition',
      header: 'Competition',
      accessorFn: (idea) => idea.competitionIndex ?? 0,
      meta: { width: '8rem', cellClassName: 'justify-center' },
      sortDescFirst: true,
      sortFn: (a: R, b: R) => compare(a.original.competitionIndex ?? 0, b.original.competitionIndex ?? 0),
      cell: ({ row }) => <CompetitionBadge idea={row.original} />,
   },
   // ── Hidden helper column: phrase-group filter ──
   {
      id: 'groups',
      accessorFn: (idea) => idea.keyword,
      filterFn: (row, _columnId, value: string[]) => matchesIdeaTags(row.original.keyword, value),
   },
];
