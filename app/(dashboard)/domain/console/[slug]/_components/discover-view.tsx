'use client';

import { startTransition, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
   getDomainLocations, getDomainTags, scraperAllowsCity, type TrackerDevice,
} from 'utils/keywordMeta';
import { DomainHeader } from '../../../_components/domain-header';
import { DomainSettingsDialog } from '../../../_components/domain-settings-dialog';
import { useAddKeywords, useTrackedKeywordsForAdd } from '../../../_components/keyword-queries';
import { buildAddKeywordPayloads } from '../../../../_components/keyword-ideas/add-to-tracker-state';
import { useAppSettings } from '../../../../_components/settings/settings-queries';
import { Rank } from '../../../[slug]/_components/tracker-cells';
import { useScKeywords } from './sc-queries';
import { SC_PERIODS, SC_SORT_CHOICES, aggregateSCKeywords, summarizeSC } from './sc-state';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];

type DiscoverViewProps = {
   domain: DomainType;
   searchConsoleConnected: boolean;
   adwordsConnected: boolean;
   availableScrapers: Scraper[];
   systemScraperType: string;
};

const DOCS_URL = 'https://github.com/djav1985/v-serpbear/wiki/Google-Integrations';
const percent = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SCColumn = ColumnDef<DataTableFeatures, SearchAnalyticsItem>;

const COLUMNS: SCColumn[] = [
   {
      id: 'select',
      enableSorting: false,
      meta: { width: '1.5rem' },
      header: ({ table }) => {
         const rows = table.getRowModel().rows;
         const selected = rows.filter((row) => row.getIsSelected()).length;
         return (
            <Checkbox
               aria-label="Select all keywords"
               disabled={rows.length === 0}
               checked={rows.length > 0 && selected === rows.length ? true : (selected > 0 ? 'indeterminate' : false)}
               onCheckedChange={(value) => table.setRowSelection(value === true ? Object.fromEntries(rows.map((row) => [row.id, true])) : {})}
            />
         );
      },
      cell: ({ row }) => (
         <Checkbox
            aria-label={`Select ${row.original.keyword}`}
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

export function DiscoverView({ domain, searchConsoleConnected, adwordsConnected, availableScrapers, systemScraperType }: DiscoverViewProps) {
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

   const trackedQuery = useTrackedKeywordsForAdd(domain.domain, showAddStep);
   const settingsQuery = useAppSettings(showAddStep, true);
   const allowsCity = scraperAllowsCity(settingsQuery.data, domain.scraper_settings?.scraper_type);
   const trackedData = trackedQuery.data;
   const tracked = useMemo(() => trackedData ?? [], [trackedData]);

   const forDevice = useMemo(() => grouped.filter((row) => row.device === device), [grouped, device]);
   const countryOptions = useMemo(() => [...new Set(forDevice.map((row) => row.country))].map((code) => ({ label: countries[code]?.[0] ?? code, value: code })), [forDevice]);

   const rows = useMemo(() => {
      const filtered = SCfilterKeywords(forDevice, { countries: pickedCountries, tags: [], search });
      return SCsortKeywords(filtered, sortBy);
   }, [forDevice, pickedCountries, search, sortBy]);
   const summary = useMemo(() => summarizeSC(rows), [rows]);

   const table = useTable({
      features: dataTableFeatures,
      data: rows,
      columns: COLUMNS,
      getRowId: (row) => row.uid,
      state: { rowSelection },
      onRowSelectionChange: setRowSelection,
   });

   // Selection holds only rows that are on screen and can still be added.
   const [checked, setChecked] = useState({ rows, rowSelection });
   if (checked.rows !== rows || checked.rowSelection !== rowSelection) {
      setChecked({ rows, rowSelection });
      const selected = Object.keys(rowSelection);
      const visible = new Set(rows.map((row) => row.uid));
      const kept = selected.filter((id) => visible.has(id));
      if (kept.length !== selected.length) { setRowSelection(Object.fromEntries(kept.map((id) => [id, true]))); }
   }

   const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);
   const { mutate: addKeywords, isPending: isAdding } = useAddKeywords(() => { router.push(`/domain/${domain.slug}`); });

   const submit = ({ tags, location, country }: { tags: string[]; location: string; country: string }) => {
      if (isAdding || trackedQuery.isFetching || trackedQuery.isError || !trackedData || settingsQuery.isFetching || settingsQuery.isError || !settingsQuery.data) { return; }
      const items = rows.filter((row) => rowSelection[row.uid]).map(({ keyword, country: itemCountry }) => ({ keyword, country: itemCountry }));
      const { payloads, skipped } = buildAddKeywordPayloads({
         items, domain: domain.domain, devices: addDevices, tags, location, country, tracked,
      });
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
            searchConsoleConnected={searchConsoleConnected}
            adwordsConnected={adwordsConnected}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={() => exportCSV(grouped, domain.domain, period)}
         >
            <Select value={period} onValueChange={(value) => startTransition(() => setPeriod(value))}>
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
                           onClick={() => startTransition(() => { setDevice(value); setPickedCountries([]); setRowSelection({}); })}
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
                        onChange={(next) => startTransition(() => setPickedCountries(next))}
                        emptyMessage="No countries found"
                     />
                     <div className="relative max-lg:order-1 max-lg:min-w-0 max-lg:flex-1 max-lg:basis-0">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input data-testid="filter_input" className="h-8 w-full pl-8 lg:w-44" placeholder="Filter keywords..." value={search} onChange={(event) => startTransition(() => setSearch(event.target.value))} />
                     </div>
                     <Select value={sortBy} onValueChange={(value) => startTransition(() => setSortBy(value))}>
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
                           aria-label={`Select ${row.original.keyword}`}
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
               isLoadingExisting={trackedQuery.isPending || trackedQuery.isFetching || settingsQuery.isPending || settingsQuery.isFetching}
               existingLoadError={trackedQuery.isError || settingsQuery.isError}
               onRetryExisting={() => { void Promise.all([trackedQuery.refetch(), settingsQuery.refetch()]); }}
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
