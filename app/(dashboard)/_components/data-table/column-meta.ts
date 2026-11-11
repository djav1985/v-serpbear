import type { RowData, TableFeatures } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
   // Presentation hints a view gives each column. The table reads them; it never decides what a column shows.
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue = unknown> {
      /** CSS grid track for the column, for example '6rem' or 'minmax(0, 2fr)'. Defaults to an equal share. */
      width?: string;
      /** Extra classes for the header and body cells. Use it for alignment, for example 'justify-center text-center'. */
      cellClassName?: string;
   }
}
