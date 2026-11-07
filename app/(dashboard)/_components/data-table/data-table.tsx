'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { ReactTable, Row, RowData } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Skeleton } from 'components/ui/skeleton';
import { useIsMobile } from 'hooks/use-mobile';
import { cn } from 'lib/utils';
import './column-meta';
import type { DataTableFeatures } from './features';

type DataTableProps<TData extends RowData> = {
   table: ReactTable<DataTableFeatures, TData>;
   /** Accessible name of the table. */
   label: string;
   /** First-paint guess for a desktop row. Rows are measured after they render, so this only avoids a jump. */
   estimateRowHeight?: number;
   /** First-paint guess for a stacked (mobile) row. */
   estimateStackedHeight?: number;
   /** When set, narrow screens show this card per row instead of the grid. */
   renderStackedRow?: (row: Row<DataTableFeatures, TData>) => ReactNode;
   /** True while the first load is in flight. Shows skeletons only when there are no rows yet. */
   isLoading?: boolean;
   /** Shown when loading has finished and no row matches. */
   emptyMessage?: ReactNode;
   /** Classes for the scroll area. Give it a height, for example 'h-[65vh]'. */
   className?: string;
   /** The narrowest the grid may get before the area scrolls sideways. Set it to what the columns need. */
   minWidth?: string;
   onRowClick?: (row: Row<DataTableFeatures, TData>) => void;
};

const DEFAULT_TRACK = 'minmax(0, 1fr)';

/**
 * A grid table whose rows are virtualized, so a domain with thousands of keywords scrolls without rendering them all.
 * Which rows exist, in what order, and which are selected comes from the TanStack table instance, so selection and
 * bulk actions are tied to row IDs and never to what happens to be on screen.
 */
export function DataTable<TData extends RowData>({
   table,
   label,
   estimateRowHeight = 57,
   estimateStackedHeight = 150,
   renderStackedRow,
   isLoading = false,
   emptyMessage = 'Nothing to show.',
   className,
   minWidth = '56rem',
   onRowClick,
}: DataTableProps<TData>) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const isMobile = useIsMobile();
   const stacked = isMobile && !!renderStackedRow;
   const rows = table.getRowModel().rows;
   const columns = table.getVisibleLeafColumns();
   const gridStyle: CSSProperties = {
      gridTemplateColumns: columns.map((column) => column.columnDef.meta?.width ?? DEFAULT_TRACK).join(' '),
   };

   const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => (stacked ? estimateStackedHeight : estimateRowHeight),
      getItemKey: (index) => rows[index]?.id ?? index,
      overscan: 8,
   });

   const showSkeleton = isLoading && rows.length === 0;
   const showEmpty = !isLoading && rows.length === 0;

   return (
      <div
         ref={scrollRef}
         role="table"
         aria-label={label}
         aria-rowcount={rows.length}
         aria-busy={isLoading}
         className={cn('relative w-full overflow-auto', className)}
      >
         {!stacked && (
            <div role="rowgroup" className="bg-card sticky top-0 z-10 border-y" style={{ minWidth }}>
               {table.getHeaderGroups().map((headerGroup) => (
                  <div key={headerGroup.id} role="row" className="bg-muted/40 grid items-center gap-3 px-4 py-3 text-xs font-semibold" style={gridStyle}>
                     {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sorted = header.column.getIsSorted();
                        return (
                           <div
                              key={header.id}
                              role="columnheader"
                              aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                              className={cn('flex min-w-0 items-center', header.column.columnDef.meta?.cellClassName)}
                           >
                              {header.isPlaceholder ? null : canSort ? (
                                 <button
                                    type="button"
                                    className="hover:text-foreground flex items-center gap-1"
                                    onClick={header.column.getToggleSortingHandler()}
                                 >
                                    <table.FlexRender header={header} />
                                    {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                                 </button>
                              ) : (
                                 <table.FlexRender header={header} />
                              )}
                           </div>
                        );
                     })}
                  </div>
               ))}
            </div>
         )}

         {showSkeleton && (
            <div className="flex flex-col gap-2 p-4" aria-label="Loading">
               {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </div>
         )}

         {showEmpty && <div className="text-muted-foreground p-10 text-center text-sm">{emptyMessage}</div>}

         {rows.length > 0 && (
            <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize(), minWidth: stacked ? undefined : minWidth }}>
               {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                     <div
                        key={row.id}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        role="row"
                        aria-rowindex={virtualRow.index + 1}
                        aria-selected={row.getIsSelected()}
                        className={cn(
                           'absolute top-0 left-0 w-full border-b',
                           row.getIsSelected() && 'bg-accent/50',
                           onRowClick && 'cursor-pointer',
                        )}
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                     >
                        {stacked ? renderStackedRow(row) : (
                           <div className="grid items-center gap-3 px-4 py-2" style={gridStyle}>
                              {row.getAllCells()
                                 .filter((cell) => cell.column.getIsVisible())
                                 .map((cell) => (
                                    <div key={cell.id} role="cell" className={cn('flex min-w-0 items-center', cell.column.columnDef.meta?.cellClassName)}>
                                       <table.FlexRender cell={cell} />
                                    </div>
                                 ))}
                           </div>
                        )}
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   );
}
