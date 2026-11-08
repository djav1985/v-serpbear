import type { ColumnDef, RowData } from '@tanstack/react-table';
import { Checkbox } from 'components/ui/checkbox';
import type { DataTableFeatures } from './features';

/**
 * The selection checkbox column. Rows are selected by their ID (set with `getRowId` on the table), and the header
 * box acts on every row that matches the current filters, not just the rows rendered on screen.
 */
export const createSelectColumn = <TData extends RowData>(rowLabel: (row: TData) => string): ColumnDef<DataTableFeatures, TData> => ({
   id: 'select',
   enableSorting: false,
   enableHiding: false,
   meta: { width: '1.5rem' },
   header: ({ table }) => {
      const filtered = table.getFilteredRowModel().rows;
      const selectedCount = filtered.filter((row) => row.getIsSelected()).length;
      const checked = filtered.length > 0 && selectedCount === filtered.length;
      return (
         <Checkbox
            aria-label="Select all matching rows"
            disabled={filtered.length === 0}
            checked={checked || (selectedCount > 0 && 'indeterminate')}
            onCheckedChange={(value) => {
               table.setRowSelection(
                  value === true ? Object.fromEntries(filtered.map((row) => [row.id, true])) : {},
               );
            }}
         />
      );
   },
   cell: ({ row }) => (
      <Checkbox
         aria-label={`Select ${rowLabel(row.original)}`}
         checked={row.getIsSelected()}
         onCheckedChange={(value) => row.toggleSelected(value === true)}
         onClick={(event) => event.stopPropagation()}
      />
   ),
});
