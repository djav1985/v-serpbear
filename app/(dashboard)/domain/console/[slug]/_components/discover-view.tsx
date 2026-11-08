'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTable, type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import { CalendarDays, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AddToTrackerBar } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-bar';
import { AddToTrackerDialog } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-dialog';
import { DataTable } from 'app/(dashboard)/_components/data-table/data-table';
import { dataTableFeatures, type DataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { MultiSelect } from 'app/(dashboard)/_components/multi-select';
import { Checkbox } from 'components/ui/checkbox';
import { Input } from 'components/ui/input';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { cn } from 'lib/utils';
import exportCSV from 'utils/client/exportcsv';
import { formattedNum } from 'utils/client/helpers';
import { SCfilterKeywords, SCsortKeywords } from 'utils/client/sortFilter';
import countries from 'utils/countries';
import {
   buildKeywordAddPayloads, getDomainLocations, getDomainTags, splitAlreadyTrackedByLocation, trackedTargetKey, type TrackerDevice,
} from 'utils/keywordMeta';
import { isCountryOnlyLocation } from 'utils/location';
import { DomainHeader } from '../../../_components/domain-header';
import { DomainSettingsDialog } from '../../../_components/domain-settings-dialog';
import { fetchKeywords, keywordsKey, useAddKeywords } from '../../../_components/keyword-queries';
import { Rank } from '../../../[slug]/_components/tracker-cells';
import { useScKeywords } from './sc-queries';
import { SC_PERIODS, SC_SORT_CHOICES, aggregateSCKeywords, summarizeSC } from './sc-state';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];

type DiscoverViewProps = {
   domain: DomainType;
   searchConsoleConnected: boolean;
   allowsCity: boolean;
   availableScrapers: Scraper[];
   systemScraperType: string;
};

const DOCS_URL = 'https://github.com/djav1985/v-serpbear/wiki/Google-Integrations';
const percent = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Search Console rows are country level, so a row counts as tracked only when it is tracked without a city location.
const countryOnly = (location?: string | null) => isCountryOnlyLocation((location || '').trim());

type SCColumn = ColumnDef<DataTableFeatures, SearchAnalyticsItem & { isTracked: boolean }>;

const COLUMNS: SCColumn[] = [
   {
      id: 'select',
      enableSorting: false,
      meta: { width: '1.5rem' },
      header: ({ table }) => {
         const addable = table.getRowModel().rows.filter((row) => !row.original.isTracked);
         const selected = addable.filter((row) => row.getIsSelected()).length;
         return (
            <Checkbox
               aria-label="Select all keywords that can be added"
               disabled={addable.length === 0}
               checked={addable.length > 0 && selected === addable.length ? true : (selected > 0 ? 'indeterminate' : false)}
               onCheckedChange={(value) => table.setRowSelection(value === true ? Object.fromEntries(addable.map((row) => [row.id, true])) : {})}
            />
         );
      },
      cell: ({ row }) => (
         <Checkbox
            aria-label={row.original.isTracked ? 'Keyword already tracked' : `Select ${row.original.keyword}`}
            title={row.original.isTracked ? 'Already in Tracker' : undefined}
            disabled={row.original.isTracked}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
         />
      ),
   },
   {
      id: 'keyword',
      header: 'Keyword',
      accessorFn: (row) => row.keyword,
      enableSorting: false,
      meta: { width: 'minmax(12rem, 3fr)' },
      cell: ({ row }) => (
         <div className="flex min-w-0 items-center gap-2">
            <span className={`fflag fflag-${row.original.country} h-[12px] w-[18px] shrink-0`} title={countries[row.original.country]?.[0] ?? row.original.country} />
            <span className="truncate font-medium" title={row.original.keyword}>{row.original.keyword}</span>
         </div>
      ),
   },
   { id: 'position', header: 'Position', enableSorting: false, meta: { width: '6rem', cellClassName: 'justify-center' }, cell: ({ row }) => <span className="font-semibold"><Rank position={row.original.position} /></span> },
   { id: 'impressions', header: 'Impressions', enableSorting: false, meta: { width: '7rem', cellClassName: 'justify-center' }, cell: ({ row }) => formattedNum(row.original.impressions) },
   { id: 'visits', header: 'Visits', enableSorting: false, meta: { width: '6rem', cellClassName: 'justify-center' }, cell: ({ row }) => formattedNum(row.original.clicks) },
   { id: 'ctr', header: 'CTR', enableSorting: false, meta: { width: '6rem', cellClassName: 'justify-center' }, cell: ({ row }) => `${percent.format(row.original.ctr)}%` },
];

export function DiscoverView({ domain, searchConsoleConnected, allowsCity, availableScrapers, systemScraperType }: DiscoverViewProps) {
   const router = useRouter();
   const [period, setPeriod] = useState<string>('thirtyDays');
   const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
   const [search, setSearch] = useState('');
   const [pickedCountries, setPickedCountries] = useState<string[]>([]);
   const [sortBy, setSortBy] = useState('imp_desc');
   const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
   const [addDevices, setAddDevices] = useState<TrackerDevice[]>(['desktop']);
   const [showAddStep, setShowAddStep] = useState(false);
   const [settingsOpen, setSettingsOpen] = useState(false);

   const { data: scData, isLoading, isError } = useScKeywords(domain.domain, searchConsoleConnected);

   const grouped = useMemo(() => {
      const periodRows = (scData as unknown as Record<string, SearchAnalyticsItem[]> | undefined)?.[period] ?? [];
      return aggregateSCKeywords(periodRows);
   }, [scData, period]);

   const { data: trackedData } = useQuery({ queryKey: keywordsKey(domain.domain), queryFn: () => fetchKeywords(domain.domain) });
   const tracked = useMemo(() => trackedData ?? [], [trackedData]);
   const trackedCountryLevel = useMemo(() => {
      const lookup = new Set<string>();
      tracked.forEach((k) => { if (k.keyword && k.country && k.device && countryOnly(k.location)) { lookup.add(`${k.keyword}:${k.country}:${k.device}`); } });
      return lookup;
   }, [tracked]);
   const trackedLookup = useMemo(() => {
      const lookup: Record<string, boolean> = {};
      tracked.forEach((k) => { if (k.keyword && k.country && k.device) { lookup[trackedTargetKey(k.keyword, k.country, k.device, k.location ?? '')] = true; } });
      return lookup;
   }, [tracked]);

   const forDevice = useMemo(() => grouped.filter((row) => row.device === device), [grouped, device]);
   const countryOptions = useMemo(() => [...new Set(forDevice.map((row) => row.country))].map((code) => ({ label: countries[code]?.[0] ?? code, value: code })), [forDevice]);

   const rows = useMemo(() => {
      const filtered = SCfilterKeywords(forDevice, { countries: pickedCountries, tags: [], search });
      return SCsortKeywords(filtered, sortBy).map((row) => ({ ...row, isTracked: trackedCountryLevel.has(`${row.keyword}:${row.country}:${row.device}`) }));
   }, [forDevice, pickedCountries, search, sortBy, trackedCountryLevel]);
   const summary = useMemo(() => summarizeSC(rows), [rows]);

   const table = useTable({
      features: dataTableFeatures,
      data: rows,
      columns: COLUMNS,
      getRowId: (row) => row.uid,
      state: { rowSelection },
      enableRowSelection: (row) => !row.original.isTracked,
      onRowSelectionChange: setRowSelection,
   });

   // Selection holds only rows that are on screen and can still be added.
   useEffect(() => {
      const selected = Object.keys(rowSelection);
      if (selected.length === 0) { return; }
      const addable = new Set(rows.filter((row) => !row.isTracked).map((row) => row.uid));
      const kept = selected.filter((id) => addable.has(id));
      if (kept.length !== selected.length) { setRowSelection(Object.fromEntries(kept.map((id) => [id, true]))); }
   }, [rows, rowSelection]);

   const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);
   const { mutate: addKeywords, isPending: isAdding } = useAddKeywords(() => { router.push(`/domain/${domain.slug}`); });

   const submit = ({ tags, location, country }: { tags: string[]; location: string; country: string }) => {
      if (isAdding) { return; }
      const items = rows.filter((row) => rowSelection[row.uid]).map(({ keyword, country: itemCountry }) => ({ keyword, country: itemCountry }));
      const { payloads, skipped } = splitAlreadyTrackedByLocation(buildKeywordAddPayloads({
         items, domain: domain.domain, devices: addDevices, tags, location, country,
      }), trackedLookup);
      addKeywords({ payloads, skipped });
      setRowSelection({});
      setShowAddStep(false);
   };

   const existingTags = useMemo(() => getDomainTags(tracked), [tracked]);
   const existingLocations = useMemo(() => getDomainLocations(tracked), [tracked]);

   const emptyMessage = !searchConsoleConnected ? (
      <>Google Search Console has not been integrated yet. Follow <a className="text-primary underline" href={DOCS_URL} target="_blank" rel="noreferrer">these steps</a> to integrate Google Search data for this domain.</>
   ) : isError || (grouped.length === 0) ? 'Could not fetch keyword data for this domain from Google Search Console.'
      : 'No keywords match these filters.';

   return (
      <div className="flex flex-col gap-4">
         <DomainHeader
            domain={domain}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={() => exportCSV(grouped, domain.domain, period)}
         >
            <Select value={period} onValueChange={setPeriod}>
               <SelectTrigger size="sm" className="w-32" aria-label="Search Console period" data-testid="sc_period"><CalendarDays className="size-4" /><SelectValue /></SelectTrigger>
               <SelectContent>{SC_PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
         </DomainHeader>

         <div className="bg-card rounded-xl border shadow-sm" data-testid="domKeywords">
            {selectedIds.length > 0 ? (
               <AddToTrackerBar
                  selectedCount={selectedIds.length}
                  devices={addDevices}
                  onDevicesChange={setAddDevices}
                  onAdd={() => { if (addDevices.length > 0) { setShowAddStep(true); } else { toast.warning('Pick at least one device.'); } }}
                  addDisabled={addDevices.length === 0}
                  onClear={() => setRowSelection({})}
               />
            ) : (
               <div className="flex flex-wrap items-center gap-2 p-4 lg:flex-row lg:justify-between lg:gap-3">
                  <div className="flex items-center gap-1" role="tablist" aria-label="Device">
                     {(['desktop', 'mobile'] as const).map((value) => (
                        <button
                           key={value}
                           type="button"
                           role="tab"
                           aria-selected={device === value}
                           data-testid={`${value}_tab`}
                           className={cn('rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap capitalize transition-colors', device === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}
                           onClick={() => { setDevice(value); setPickedCountries([]); setRowSelection({}); }}
                        >
                           {value}
                           <span className="bg-background ml-1.5 rounded-full px-1.5 text-[0.7rem] font-semibold">{grouped.filter((r) => r.device === value).length}</span>
                        </button>
                     ))}
                  </div>
                  <div className="max-lg:contents lg:flex lg:flex-wrap lg:items-center lg:gap-2">
                     <MultiSelect
                        label="Countries"
                        allLabel="All Countries"
                        testId="countries_filter"
                        className="max-lg:order-2 max-lg:min-w-0 max-lg:flex-1 max-lg:basis-[calc(50%-0.25rem)]"
                        options={countryOptions}
                        selected={pickedCountries}
                        onChange={setPickedCountries}
                        emptyMessage="No countries found"
                     />
                     <div className="relative max-lg:order-1 max-lg:min-w-28 max-lg:flex-1 max-lg:basis-28">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input data-testid="filter_input" className="h-8 w-full pl-8 lg:w-44" placeholder="Filter keywords..." value={search} onChange={(event) => setSearch(event.target.value)} />
                     </div>
                     <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger size="sm" className="w-full max-lg:order-2 max-lg:min-w-0 max-lg:flex-1 max-lg:basis-[calc(50%-0.25rem)] lg:w-48" data-testid="sort_button" aria-label="Sort keywords"><SelectValue /></SelectTrigger>
                        <SelectContent align="end">{SC_SORT_CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                     </Select>
                  </div>
               </div>
            )}

            <DataTable
               table={table}
               label="Search Console keywords"
               className="h-[calc(100dvh-30rem)] min-h-80"
               minWidth="38rem"
               isLoading={searchConsoleConnected && isLoading}
               emptyMessage={emptyMessage}
               estimateStackedHeight={110}
               renderStackedRow={(row) => (
                  <div className="flex flex-col gap-2 px-4 py-4 text-sm">
                     <div className="flex items-start gap-2">
                        <Checkbox
                           className="mt-0.5"
                           aria-label={row.original.isTracked ? 'Keyword already tracked' : `Select ${row.original.keyword}`}
                           disabled={row.original.isTracked}
                           checked={row.getIsSelected()}
                           onCheckedChange={(value) => row.toggleSelected(value === true)}
                        />
                        <span className={`fflag fflag-${row.original.country} mt-1 h-[12px] w-[18px] shrink-0`} />
                        <span className="min-w-0 flex-1 font-medium break-words">{row.original.keyword}</span>
                        <span className="font-semibold"><Rank position={row.original.position} /></span>
                     </div>
                     <div className="text-muted-foreground flex gap-5 pl-7 text-xs">
                        <span>{formattedNum(row.original.impressions)} views</span>
                        <span>{formattedNum(row.original.clicks)} visits</span>
                        <span>{percent.format(row.original.ctr)}% CTR</span>
                     </div>
                  </div>
               )}
            />

            {rows.length > 0 && (
               <div className="bg-accent/70 text-accent-foreground grid grid-cols-[1.5rem_minmax(12rem,3fr)_6rem_7rem_6rem_6rem] items-center gap-3 border-t px-4 py-3 text-xs font-semibold max-lg:hidden" data-testid="sc_summary">
                  <span />
                  <span>{rows.length} {device} keywords</span>
                  <span className="text-center">{summary.position}</span>
                  <span className="text-center">{formattedNum(summary.impressions)}</span>
                  <span className="text-center">{formattedNum(summary.visits)}</span>
                  <span className="text-center">{percent.format(summary.ctr)}%</span>
               </div>
            )}
         </div>

         {showAddStep && (
            <AddToTrackerDialog
               selectedCount={selectedIds.length}
               existingTags={existingTags}
               existingLocations={existingLocations}
               allowsCity={allowsCity}
               isAdding={isAdding}
               onConfirm={submit}
               onClose={() => setShowAddStep(false)}
            />
         )}
         <DomainSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            domain={domain}
            availableScrapers={availableScrapers}
            systemScraperType={systemScraperType}
         />
      </div>
   );
}
