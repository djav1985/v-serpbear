import {
   columnFilteringFeature,
   columnVisibilityFeature,
   createFilteredRowModel,
   createSortedRowModel,
   filterFn_arrIncludes,
   filterFn_equalsString,
   filterFn_includesString,
   rowSelectionFeature,
   rowSortingFeature,
   sortFn_alphanumeric,
   sortFn_basic,
   sortFn_datetime,
   sortFn_text,
   tableFeatures,
} from '@tanstack/react-table';

/**
 * The TanStack Table v9 feature registry shared by every results table.
 * v9 needs features, row models and built-in functions registered up front; one shared registry keeps every
 * `useTable`, `ColumnDef` and helper on the same type. There is no pagination feature on purpose: long lists
 * scroll and are virtualized, so a row's identity never depends on a page.
 */
export const dataTableFeatures = tableFeatures({
   columnFilteringFeature,
   columnVisibilityFeature,
   rowSelectionFeature,
   rowSortingFeature,
   filteredRowModel: createFilteredRowModel(),
   sortedRowModel: createSortedRowModel(),
   filterFns: {
      arrIncludes: filterFn_arrIncludes,
      equalsString: filterFn_equalsString,
      includesString: filterFn_includesString,
   },
   sortFns: {
      alphanumeric: sortFn_alphanumeric,
      basic: sortFn_basic,
      datetime: sortFn_datetime,
      text: sortFn_text,
   },
});

export type DataTableFeatures = typeof dataTableFeatures;
