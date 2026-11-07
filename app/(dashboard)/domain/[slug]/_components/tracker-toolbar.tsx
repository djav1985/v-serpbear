'use client';

import { Columns3, Lock, Monitor, Search, Smartphone } from 'lucide-react';
import { MultiSelect, type MultiSelectOption } from 'app/(dashboard)/_components/multi-select';
import { Button } from 'components/ui/button';
import {
   DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Input } from 'components/ui/input';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { cn } from 'lib/utils';
import { NO_TAGS_FILTER, resolveTagSelection } from 'utils/client/sortFilter';
import { LOCKED_COLUMNS, OPTIONAL_COLUMNS, SC_PERIODS, SORT_CHOICES, type TrackerDevice } from './tracker-state';

type TrackerToolbarProps = {
   device: TrackerDevice;
   deviceCounts: Record<TrackerDevice, number>;
   onDeviceChange: (device: TrackerDevice) => void;
   countries: string[];
   countryOptions: MultiSelectOption[];
   onCountriesChange: (next: string[]) => void;
   tags: string[];
   tagOptions: string[];
   onTagsChange: (next: string[]) => void;
   search: string;
   onSearchChange: (value: string) => void;
   sortChoice: string;
   onSortChange: (value: string) => void;
   searchConsoleConnected: boolean;
   optionalColumns: string[];
   onToggleColumn: (column: string) => void;
   columnsDisabled: boolean;
   /** The Search Console period picker. Shown only while the Search Console column is on screen. */
   showScPeriod: boolean;
   scPeriod: string;
   onScPeriodChange: (value: string) => void;
};

const DEVICE_TABS: { value: TrackerDevice; label: string; icon: typeof Monitor }[] = [
   { value: 'desktop', label: 'Desktop', icon: Monitor },
   { value: 'mobile', label: 'Mobile', icon: Smartphone },
];

export function TrackerToolbar({
   device, deviceCounts, onDeviceChange, countries, countryOptions, onCountriesChange, tags, tagOptions, onTagsChange,
   search, onSearchChange, sortChoice, onSortChange, searchConsoleConnected, optionalColumns, onToggleColumn, columnsDisabled,
   showScPeriod, scPeriod, onScPeriodChange,
}: TrackerToolbarProps) {
   const sortChoices = SORT_CHOICES.filter((choice) => !choice.searchConsoleOnly || searchConsoleConnected);

   return (
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
         <div className="flex items-center gap-1" role="tablist" aria-label="Device">
            {DEVICE_TABS.map(({ value, label, icon: Icon }) => (
               <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={device === value}
                  data-testid={`${value}_tab`}
                  className={cn(
                     'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                     device === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                  onClick={() => onDeviceChange(value)}
               >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="bg-background rounded-full px-1.5 text-[0.7rem] font-semibold">{deviceCounts[value]}</span>
               </button>
            ))}
         </div>

         <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
            <MultiSelect
               label="Countries"
               allLabel="All Countries"
               testId="country_filter"
               options={countryOptions}
               selected={countries}
               onChange={onCountriesChange}
               emptyMessage="No countries yet"
            />
            <MultiSelect
               label="Tags"
               allLabel="All Tags"
               testId="tags_filter"
               options={[{ label: 'No Tags', value: NO_TAGS_FILTER }, ...tagOptions.map((tag) => ({ label: tag, value: tag }))]}
               selected={tags}
               // "No Tags" cannot be combined with specific tags (see resolveTagSelection).
               onChange={(next) => onTagsChange(resolveTagSelection(tags, next))}
               emptyMessage="No tags found for this domain"
            />
            <div className="relative col-span-2 max-lg:order-first">
               <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
               <Input
                  data-testid="filter_input"
                  className="h-8 w-full pl-8 lg:w-44"
                  placeholder="Filter keywords..."
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
               />
            </div>
            <div className="col-span-2 flex gap-2 lg:contents">
            <Select value={sortChoice || undefined} onValueChange={onSortChange}>
               <SelectTrigger size="sm" className="w-full lg:w-48" data-testid="sort_button" aria-label="Sort keywords">
                  <SelectValue placeholder="Sorted by column" />
               </SelectTrigger>
               <SelectContent align="end">
                  {sortChoices.map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}
               </SelectContent>
            </Select>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     variant="outline"
                     size="icon-sm"
                     data-testid="columns_button"
                     aria-label="Show or hide columns"
                     title={columnsDisabled ? 'Loading settings...' : 'Show or hide columns'}
                     disabled={columnsDisabled}
                  >
                     <Columns3 />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {LOCKED_COLUMNS.map((column) => (
                     <DropdownMenuCheckboxItem key={column} checked disabled title="Cannot be hidden">
                        <Lock className="size-3" />{column}
                     </DropdownMenuCheckboxItem>
                  ))}
                  {OPTIONAL_COLUMNS.map((column) => (
                     <DropdownMenuCheckboxItem
                        key={column}
                        checked={optionalColumns.includes(column)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => onToggleColumn(column)}
                     >
                        {column}
                     </DropdownMenuCheckboxItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
            </div>
            {showScPeriod && (
               <Select value={scPeriod} onValueChange={onScPeriodChange}>
                  <SelectTrigger size="sm" className="col-span-2 w-full lg:w-52" data-testid="sc_period" aria-label="Search Console period"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                     {SC_PERIODS.map((period) => <SelectItem key={period.value} value={period.value}>{`Search Console: ${period.label}`}</SelectItem>)}
                  </SelectContent>
               </Select>
            )}
         </div>
      </div>
   );
}
