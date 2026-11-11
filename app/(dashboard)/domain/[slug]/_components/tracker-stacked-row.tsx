'use client';

import type { Row } from '@tanstack/react-table';
import type { DataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { Checkbox } from 'components/ui/checkbox';
import { formattedNum } from 'utils/client/helpers';
import {
   BestCell, KeywordCell, PositionCell, RowActions, SearchConsoleCell, Sparkline, UpdatedCell, UrlCell,
} from './tracker-cells';
import type { TrackerColumnConfig } from './tracker-columns';

type TrackerStackedRowProps = {
   row: Row<DataTableFeatures, KeywordType>;
   config: TrackerColumnConfig;
   /** Which optional columns are on, by their menu names ("Best", "History", "Volume", "Search Console"). */
   optionalColumns: string[];
   showSearchConsole: boolean;
};

/** One keyword as a card, for narrow screens. The same data and actions as the grid row. */
export function TrackerStackedRow({ row, config, optionalColumns, showSearchConsole }: TrackerStackedRowProps) {
   const keyword = row.original;
   return (
      <div className="flex flex-col gap-3 px-4 py-4 text-sm">
         <div className="flex items-start gap-2">
            <Checkbox
               className="mt-0.5"
               aria-label={`Select ${keyword.keyword}`}
               checked={row.getIsSelected()}
               onCheckedChange={(value) => row.toggleSelected(value === true)}
            />
            <div className="min-w-0 flex-1">
               <KeywordCell keyword={keyword} allowsCity={config.allowsCity} onOpenDetails={config.onOpenDetails} onUnfavorite={config.onToggleFavorite} />
            </div>
            <RowActions
               keyword={keyword}
               onRefresh={config.onRefresh}
               onToggleFavorite={config.onToggleFavorite}
               onManageTags={config.onManageTags}
               onRemove={config.onRemove}
            />
         </div>

         <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 pl-7 text-xs">
            <span className="text-foreground flex items-center gap-1 text-base"><PositionCell keyword={keyword} /></span>
            {optionalColumns.includes('Best') && <span>Best <span className="text-foreground font-semibold"><BestCell keyword={keyword} /></span></span>}
            {optionalColumns.includes('Volume') && <span>Volume <span className="text-foreground font-semibold">{Number.isFinite(keyword.volume) ? formattedNum(keyword.volume) : '-'}</span></span>}
            {optionalColumns.includes('History') && <Sparkline history={keyword.history ?? {}} onClick={() => config.onOpenDetails(keyword)} />}
         </div>

         <div className="text-muted-foreground flex items-center justify-between gap-3 pl-7 text-xs">
            <div className="min-w-0 flex-1"><UrlCell keyword={keyword} /></div>
            <UpdatedCell lastUpdated={keyword.lastUpdated} />
         </div>

         {showSearchConsole && (
            <div className="border-t pt-2 pl-7">
               <p className="text-muted-foreground mb-1 text-[0.7rem] uppercase">Search Console (Pos / Imp / Visits)</p>
               <SearchConsoleCell keyword={keyword} period={config.scPeriod} />
            </div>
         )}
      </div>
   );
}
