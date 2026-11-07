'use client';

import { Columns3, Lock, Monitor, Search, Smartphone } from 'lucide-react';
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
import { LOCKED_COLUMNS, OPTIONAL_COLUMNS, SORT_CHOICES, type TrackerDevice } from './tracker-state';

type Option = { label: string; value: string; flag?: string };

type MultiSelectProps = {
   label: string;
   allLabel: string;
   options: Option[];
   selected: string[];
   onChange: (next: string[]) => void;
   emptyMessage: string;
   testId: string;
};

function MultiSelect({ label, allLabel, options, selected, onChange, emptyMessage, testId }: MultiSelectProps) {
   const summary = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} selected`;
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid={testId} aria-label={label} className="max-w-44 justify-start">
               <span className="truncate">{summary}</span>
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {options.length === 0 && <p className="text-muted-foreground px-2 py-1.5 text-xs">{emptyMessage}</p>}
            {options.map((option) => (
               <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={selected.includes(option.value)}
                  // Keep the menu open so several values can be ticked in one go.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => onChange(checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))}
               >
                  {option.flag && <span className={`fflag fflag-${option.flag} h-[12px] w-[18px] shrink-0`} />}
                  <span className="truncate">{option.label}</span>
               </DropdownMenuCheckboxItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

type TrackerToolbarProps = {
   device: TrackerDevice;
   deviceCounts: Record<TrackerDevice, number>;
   onDeviceChange: (device: TrackerDevice) => void;
   countries: string[];
   countryOptions: Option[];
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
};

const DEVICE_TABS: { value: TrackerDevice; label: string; icon: typeof Monitor }[] = [
   { value: 'desktop', label: 'Desktop', icon: Monitor },
   { value: 'mobile', label: 'Mobile', icon: Smartphone },
];

export function TrackerToolbar({
   device, deviceCounts, onDeviceChange, countries, countryOptions, onCountriesChange, tags, tagOptions, onTagsChange,
   search, onSearchChange, sortChoice, onSortChange, searchConsoleConnected, optionalColumns, onToggleColumn, columnsDisabled,
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
                     'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
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

         <div className="flex flex-wrap items-center gap-2">
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
            <div className="relative">
               <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
               <Input
                  data-testid="filter_input"
                  className="h-8 w-44 pl-8"
                  placeholder="Filter keywords..."
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
               />
            </div>
            <Select value={sortChoice || undefined} onValueChange={onSortChange}>
               <SelectTrigger size="sm" className="w-48" data-testid="sort_button" aria-label="Sort keywords">
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
      </div>
   );
}
