'use client';

import { startTransition, useCallback, useMemo, useState } from 'react';
import {
   useTable, type ColumnFiltersState, type ColumnVisibilityState, type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { MapPin, RefreshCw, Tags, Trash2, X } from 'lucide-react';
import { DataTable } from 'app/(dashboard)/_components/data-table/data-table';
import { dataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { useShell } from 'app/(dashboard)/_components/shell-context';
import { Button } from 'components/ui/button';
import exportCSV from 'utils/client/exportcsv';
import { NO_TAGS_FILTER } from 'utils/client/sortFilter';
import countries from 'utils/countries';
import { getDomainLocations, getDomainTags } from 'utils/keywordMeta';
import { AddKeywordsDialog } from '../../_components/add-keywords-dialog';
import { DomainHeader } from '../../_components/domain-header';
import { DomainSettingsDialog } from '../../_components/domain-settings-dialog';
import {
   useFavoriteKeyword, useKeywords, useRefreshKeywords, useUpdateKeywordColumns,
} from '../../_components/keyword-queries';
import { KeywordDetails } from './keyword-details';
import { createTrackerColumns, type TrackerColumnConfig } from './tracker-columns';
import { TrackerDialogs, type TrackerDialog } from './tracker-dialogs';
import { TrackerStackedRow } from './tracker-stacked-row';
import {
   DEFAULT_FILTERS, DEFAULT_SC_PERIOD, DEFAULT_SORT_CHOICE, STICKY_FIRST, choiceForSorting, sortingForChoice, toColumnFilters,
   type TrackerDevice, type TrackerFilters,
} from './tracker-state';
import { TrackerToolbar } from './tracker-toolbar';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];

type TrackerViewProps = {
   /** The domain, with credentials masked, as the domain settings dialog needs it. */
   domain: DomainType;
   /** null when the server could not read the keywords, so the browser tries again and the error stays visible if it fails. */
   initialKeywords: KeywordType[] | null;
   /** The optional columns switched on (settings.keywordsColumns). */
   initialColumns: string[];
   scraperConfigured: boolean;
   /** The global Search Console integration, or this domain's own credentials. */
   searchConsoleConnected: boolean;
   allowsCity: boolean;
   scraperName: string;
   scraperCountries?: string[];
   availableScrapers: Scraper[];
   systemScraperType: string;
};

const stripSticky = (sorting: SortingState): SortingState => sorting.filter((entry) => entry.id !== STICKY_FIRST.id);

export function TrackerView({
   domain, initialKeywords, initialColumns, scraperConfigured, searchConsoleConnected, allowsCity, scraperName, scraperCountries,
   availableScrapers, systemScraperType,
}: TrackerViewProps) {
   const { openSettings } = useShell();
   const keywordsQuery = useKeywords(domain.domain, initialKeywords ?? undefined);
   const keywords = useMemo(() => keywordsQuery.data ?? [], [keywordsQuery.data]);

   // ── Table state ───────────────────────────────────────────────────────────
   const [filters, setFilters] = useState<TrackerFilters>(DEFAULT_FILTERS);
   // Filter changes run as a transition so the rows that move or leave animate (see ViewTransition in DataTable)
   const updateFilters = (next: TrackerFilters) => startTransition(() => setFilters(next));
   const [userSort, setUserSort] = useState<SortingState>(() => sortingForChoice(DEFAULT_SORT_CHOICE));
   const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
   const [scPeriod, setScPeriod] = useState(DEFAULT_SC_PERIOD);
   const [optionalColumns, setOptionalColumns] = useState<string[]>(initialColumns);
   const [dialog, setDialog] = useState<TrackerDialog>(null);
   const [detailsId, setDetailsId] = useState<number | null>(null);
   const [addKeywordsOpen, setAddKeywordsOpen] = useState(false);
   const [domainSettingsOpen, setDomainSettingsOpen] = useState(false);

   const { mutate: refreshKeywords } = useRefreshKeywords(() => {});
   const { mutate: setFavorite } = useFavoriteKeyword();
   const { mutate: saveColumnChoice, isPending: savingColumns } = useUpdateKeywordColumns();

   const showSearchConsole = searchConsoleConnected && optionalColumns.includes('Search Console');

   const columnConfig = useMemo<TrackerColumnConfig>(() => ({
      allowsCity,
      scPeriod,
      onOpenDetails: (keyword) => setDetailsId(keyword.ID),
      onRefresh: (keyword) => refreshKeywords({ ids: [keyword.ID] }),
      onToggleFavorite: (keyword) => setFavorite({ keywordID: keyword.ID, sticky: !keyword.sticky }),
      onManageTags: (keyword) => setDialog({ type: 'tags', ids: [keyword.ID] }),
      onRemove: (keyword) => setDialog({ type: 'remove', ids: [keyword.ID] }),
   }), [allowsCity, scPeriod, refreshKeywords, setFavorite]);
   const columns = useMemo(() => createTrackerColumns(columnConfig), [columnConfig]);

   const columnFilters = useMemo<ColumnFiltersState>(() => toColumnFilters(filters), [filters]);
   const columnVisibility = useMemo<ColumnVisibilityState>(() => ({
      best: optionalColumns.includes('Best'),
      history: optionalColumns.includes('History'),
      volume: optionalColumns.includes('Volume'),
      sc: showSearchConsole,
      // Helper columns exist only to filter and sort on.
      device: false, country: false, tags: false, sticky: false, added: false, scImpressions: false, scVisits: false,
   }), [optionalColumns, showSearchConsole]);
   // Favorites stay on top whatever the user sorts by.
   const sorting = useMemo<SortingState>(() => [STICKY_FIRST, ...userSort], [userSort]);

   const table = useTable({
      features: dataTableFeatures,
      data: keywords,
      columns,
      getRowId: (keyword) => String(keyword.ID),
      state: { sorting, columnFilters, columnVisibility, rowSelection },
      enableRowSelection: true,
      enableMultiSort: false,
      onRowSelectionChange: setRowSelection,
      onSortingChange: (updater) => setUserSort((current) => stripSticky(typeof updater === 'function' ? updater([STICKY_FIRST, ...current]) : updater)),
   });

   // ── Derived from the data ─────────────────────────────────────────────────
   const allTags = useMemo(() => getDomainTags(keywords), [keywords]);
   const existingLocations = useMemo(() => getDomainLocations(keywords), [keywords]);
   const deviceCounts = useMemo(() => {
      const counts: Record<TrackerDevice, number> = { desktop: 0, mobile: 0 };
      keywords.forEach((keyword) => { counts[keyword.device === 'desktop' ? 'desktop' : 'mobile'] += 1; });
      return counts;
   }, [keywords]);
   const countryOptions = useMemo(() => [...new Set(keywords.map((k) => k.country).filter((c) => c && c.trim() !== ''))]
      .map((code) => ({ label: countries[code]?.[0] ?? code, value: code, flag: code })), [keywords]);

   // Drop a tag filter when its tag no longer exists on the domain.
   const [checkedTags, setCheckedTags] = useState(allTags);
   if (checkedTags !== allTags) {
      setCheckedTags(allTags);
      setFilters((previous) => {
         if (previous.tags.length === 0) { return previous; }
         const valid = previous.tags.filter((tag) => tag === NO_TAGS_FILTER || allTags.includes(tag));
         return valid.length === previous.tags.length ? previous : { ...previous, tags: valid };
      });
   }

   // Selection only ever holds rows that are on screen for the current device and filters. A row that is filtered out,
   // removed or on the other device tab drops out, so a bulk action never touches a row the user cannot see.
   const filteredRows = table.getFilteredRowModel().rows;
   const [checkedRows, setCheckedRows] = useState(filteredRows);
   if (checkedRows !== filteredRows) {
      setCheckedRows(filteredRows);
      setRowSelection((current) => {
         const selected = Object.keys(current);
         if (selected.length === 0) { return current; }
         const visible = new Set(filteredRows.map((row) => row.id));
         const kept = selected.filter((id) => visible.has(id));
         return kept.length === selected.length ? current : Object.fromEntries(kept.map((id) => [id, true]));
      });
   }

   const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]).map(Number), [rowSelection]);
   const clearSelection = useCallback(() => setRowSelection({}), []);

   const toggleColumn = (column: string) => {
      const next = optionalColumns.includes(column) ? optionalColumns.filter((c) => c !== column) : [...optionalColumns, column];
      setOptionalColumns(next);
      saveColumnChoice(next);
   };

   const detailsKeyword = detailsId === null ? undefined : keywords.find((k) => k.ID === detailsId);
   const isLoadingFirst = keywordsQuery.isPending && keywords.length === 0;
   const loadFailed = keywordsQuery.isError && keywords.length === 0;

   return (
      <div className="flex flex-col gap-4">
         {!scraperConfigured && (
            <div role="alert" className="bg-destructive text-destructive-foreground flex flex-wrap items-center justify-center gap-2 rounded-md p-3 text-sm">
               A scraper has not been set up yet. Open Settings to configure it and start using the app.
               <Button size="sm" variant="secondary" onClick={openSettings}>Open Settings</Button>
            </div>
         )}

         <DomainHeader
            domain={domain}
            onOpenSettings={() => setDomainSettingsOpen(true)}
            // The export covers every keyword of the domain, on both devices, whatever the filters or selection are.
            onExport={() => exportCSV(keywords, domain.domain)}
            onReloadAll={() => refreshKeywords({ ids: [], domain: domain.domain })}
            onAddKeyword={() => setAddKeywordsOpen(true)}
         />

         <div className="bg-card rounded-xl border shadow-sm" data-testid="domKeywords">
            {selectedIds.length > 0 ? (
               <div className="flex flex-wrap items-center gap-2 p-4" data-testid="bulk_actions">
                  <span className="text-muted-foreground mr-2 text-sm font-medium">{selectedIds.length} selected</span>
                  <Button variant="ghost" size="sm" onClick={() => { refreshKeywords({ ids: selectedIds }); clearSelection(); }}><RefreshCw />Refresh Keywords</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'remove', ids: selectedIds })}><Trash2 />Remove Keywords</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'tags', ids: selectedIds })}><Tags />Add/Edit Tags</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'location', ids: selectedIds })}><MapPin />Change Location</Button>
                  <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Clear selection" onClick={clearSelection}><X /></Button>
               </div>
            ) : (
               <TrackerToolbar
                  device={filters.device}
                  deviceCounts={deviceCounts}
                  onDeviceChange={(device) => updateFilters({ ...filters, device })}
                  countries={filters.countries}
                  countryOptions={countryOptions}
                  onCountriesChange={(next) => updateFilters({ ...filters, countries: next })}
                  tags={filters.tags}
                  tagOptions={allTags}
                  onTagsChange={(next) => updateFilters({ ...filters, tags: next })}
                  search={filters.search}
                  onSearchChange={(search) => updateFilters({ ...filters, search })}
                  sortChoice={choiceForSorting(userSort)}
                  onSortChange={(value) => startTransition(() => setUserSort(sortingForChoice(value)))}
                  searchConsoleConnected={searchConsoleConnected}
                  optionalColumns={optionalColumns}
                  onToggleColumn={toggleColumn}
                  columnsDisabled={savingColumns}
                  showScPeriod={showSearchConsole}
                  scPeriod={scPeriod}
                  onScPeriodChange={(value) => startTransition(() => setScPeriod(value))}
               />
            )}

            {loadFailed ? (
               <div role="alert" className="p-10 text-center text-sm">
                  <p className="text-destructive mb-3 font-medium">Could not load the keywords.</p>
                  <Button variant="outline" size="sm" onClick={() => keywordsQuery.refetch()}>Try again</Button>
               </div>
            ) : (
               <DataTable
                  table={table}
                  label="Tracked keywords"
                  className="h-[calc(100dvh-26rem)] min-h-96"
                  isLoading={isLoadingFirst}
                  emptyMessage={deviceCounts[filters.device] === 0 ? 'No keywords added for this device type.' : 'No keywords match these filters.'}
                  renderStackedRow={(row) => (
                     <TrackerStackedRow row={row} config={columnConfig} optionalColumns={optionalColumns} showSearchConsole={showSearchConsole} />
                  )}
               />
            )}
         </div>

         <TrackerDialogs
            dialog={dialog}
            keywords={keywords}
            allTags={allTags}
            existingLocations={existingLocations}
            allowsCity={allowsCity}
            onClose={() => setDialog(null)}
            onDone={(ids) => setRowSelection((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(Number(id)))))}
         />
         {detailsKeyword && <KeywordDetails keyword={detailsKeyword} onClose={() => setDetailsId(null)} />}
         <AddKeywordsDialog
            open={addKeywordsOpen}
            onOpenChange={setAddKeywordsOpen}
            domain={domain.domain}
            keywords={keywords}
            scraperName={scraperName}
            allowsCity={allowsCity}
            scraperCountries={scraperCountries}
         />
         <DomainSettingsDialog
            open={domainSettingsOpen}
            onOpenChange={setDomainSettingsOpen}
            domain={domain}
            availableScrapers={availableScrapers}
            systemScraperType={systemScraperType}
         />
      </div>
   );
}
