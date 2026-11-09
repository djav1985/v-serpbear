'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
   useTable, type ColumnFiltersState, type ColumnVisibilityState, type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { Search, Star, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from 'components/ui/input';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { cn } from 'lib/utils';
import { formattedNum } from 'utils/client/helpers';
import {
   getDomainLocations, getDomainTags, scraperAllowsCity, type TrackerDevice,
} from 'utils/keywordMeta';
import { useAddKeywords, useTrackedKeywordsForAdd } from '../../domain/_components/keyword-queries';
import { useDomain } from '../../domain/_components/domain-queries';
import { useAppSettings } from '../settings/settings-queries';
import { DataTable } from '../data-table/data-table';
import { dataTableFeatures } from '../data-table/features';
import { MultiSelect } from '../multi-select';
import { AddToTrackerBar } from './add-to-tracker-bar';
import { AddToTrackerDialog } from './add-to-tracker-dialog';
import { buildAddKeywordPayloads } from './add-to-tracker-state';
import { IdeaDetails } from './idea-details';
import {
   CompetitionBadge, IdeaKeywordCell, IdeaSelectCheckbox, VolumeSparkline, createIdeaColumns,
} from './ideas-columns';
import { useEmailIdeas, useFavoriteIdea } from './ideas-queries';
import {
   DEFAULT_IDEA_FILTERS, DEFAULT_IDEA_SORT, IDEA_SORT_CHOICES, buildIdeaGroups, ideaChoiceFor, ideaSortingFor,
   type IdeaFilters, type IdeaRow,
} from './ideas-state';

type IdeasTableProps = {
   /** The domain these ideas belong to, or null on the Research page (where the target domain is picked per action). */
   domain: string | null;
   ideas: IdeaKeyword[];
   favorites: IdeaKeyword[];
   isLoading: boolean;
   /** True when no ideas have been generated yet. */
   noIdeasDatabase: boolean;
   adwordsConnected: boolean;
   showFavorites: boolean;
   onShowFavorites: (show: boolean) => void;
   /** The domains Research can add to. */
   domains: { domain: string; slug: string }[];
   domainScraperType?: string | null;
};

const DOCS_URL = 'https://github.com/djav1985/v-serpbear/wiki/Google-Integrations';

export function IdeasTable({
   domain, ideas, favorites, isLoading, noIdeasDatabase, adwordsConnected, showFavorites, onShowFavorites, domains, domainScraperType,
}: IdeasTableProps) {
   const router = useRouter();
   const isResearch = domain === null;
   const [filters, setFilters] = useState<IdeaFilters>(DEFAULT_IDEA_FILTERS);
   const [userSort, setUserSort] = useState<SortingState>(() => ideaSortingFor(DEFAULT_IDEA_SORT));
   const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
   const [devices, setDevices] = useState<TrackerDevice[]>(['desktop']);
   const [pickedDomain, setPickedDomain] = useState('');
   const [detailsId, setDetailsId] = useState<string | null>(null);
   const [showAddStep, setShowAddStep] = useState(false);

   const targetDomain = isResearch ? pickedDomain : (domain ?? '');

   // Add-dialog metadata is fetched only when the user starts the add flow.
   const trackedQuery = useTrackedKeywordsForAdd(targetDomain, showAddStep);
   const trackedKeywords = trackedQuery.data;
   const tracked = useMemo(() => trackedKeywords ?? [], [trackedKeywords]);
   const settingsQuery = useAppSettings(showAddStep, true);
   const domainQuery = useDomain(targetDomain, showAddStep && isResearch);
   const resolvedDomainScraper = isResearch ? domainQuery.data?.scraper_settings?.scraper_type : domainScraperType;
   const allowsCity = scraperAllowsCity(settingsQuery.data, resolvedDomainScraper);

   const source = showFavorites ? favorites : ideas;
   const rows: IdeaRow[] = source;
   const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.uid)), [favorites]);
   const groups = useMemo(() => buildIdeaGroups(ideas), [ideas]);

   const { mutate: toggleFavorite, isPending: isFaving } = useFavoriteIdea(domain);
   const columns = useMemo(() => createIdeaColumns({
      favoriteIds,
      onOpenDetails: (idea) => setDetailsId(idea.uid),
      onToggleFavorite: (idea) => { if (!isFaving) { toggleFavorite({ keywordID: idea.uid }); } },
   }), [favoriteIds, isFaving, toggleFavorite]);

   const columnFilters = useMemo<ColumnFiltersState>(() => [{ id: 'keyword', value: filters.search }, { id: 'groups', value: filters.groups }], [filters]);
   const columnVisibility = useMemo<ColumnVisibilityState>(() => ({ groups: false }), []);

   const table = useTable({
      features: dataTableFeatures,
      data: rows,
      columns,
      getRowId: (idea) => idea.uid,
      state: { sorting: userSort, columnFilters, columnVisibility, rowSelection },
      enableMultiSort: false,
      onRowSelectionChange: setRowSelection,
      onSortingChange: (updater) => setUserSort((current) => (typeof updater === 'function' ? updater(current) : updater)),
   });

   // Keep selection limited to ideas that remain visible under the current filters.
   const filteredRows = table.getFilteredRowModel().rows;
   useEffect(() => {
      const selected = Object.keys(rowSelection);
      if (selected.length === 0) { return; }
      const visible = new Set(filteredRows.map((row) => row.id));
      const kept = selected.filter((id) => visible.has(id));
      if (kept.length === selected.length) { return; }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRowSelection(Object.fromEntries(kept.map((id) => [id, true])));
   }, [filteredRows, rowSelection]);

   const selectedIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);
   const selectedIdeas = useMemo(() => rows.filter((idea) => selectedIds.includes(idea.uid)), [rows, selectedIds]);
   const clearSelection = () => setRowSelection({});

   const { mutate: addKeywords, isPending: isAdding } = useAddKeywords(() => {
      clearSelection();
      setShowAddStep(false);
      const slug = domains.find((d) => d.domain === targetDomain)?.slug;
      if (!isResearch && slug) { router.push(`/domain/${slug}`); }
   });
   const { mutate: emailIdeas, isPending: isEmailing } = useEmailIdeas(clearSelection);

   const openAddStep = () => {
      if (isResearch && !pickedDomain) { toast.warning('Please select a domain before adding keywords.'); return; }
      if (devices.length > 0) { setShowAddStep(true); }
   };

   const submitToTracker = ({ tags, location, country }: { tags: string[]; location: string; country: string }) => {
      if (isAdding || isLoadingAddData || hasAddDataError || !trackedKeywords || !settingsQuery.data || (isResearch && !domainQuery.data)) { return; }
      const { payloads, skipped } = buildAddKeywordPayloads({
         items: selectedIdeas.map(({ keyword, country: itemCountry }) => ({ keyword, country: itemCountry })),
         domain: targetDomain,
         devices,
         tags,
         location,
         country,
         tracked,
      });
      addKeywords({ payloads, skipped });
   };

   const sendEmail = () => {
      if (!targetDomain) { toast.warning('Please select a domain before emailing keywords.'); return; }
      if (selectedIdeas.length === 0) { toast.warning('Select at least one keyword idea to email.'); return; }
      emailIdeas({
         domain: targetDomain,
         keywords: selectedIdeas.map((idea) => ({
            keyword: idea.keyword,
            avgMonthlySearches: idea.avgMonthlySearches,
            monthlySearchVolumes: idea.monthlySearchVolumes,
            competition: idea.competition,
            competitionIndex: idea.competitionIndex,
         })),
      });
   };

   const detailsIdea = detailsId === null ? undefined : rows.find((row) => row.uid === detailsId) ?? [...ideas, ...favorites].find((i) => i.uid === detailsId);
   const existingTags = useMemo(() => getDomainTags(tracked), [tracked]);
   const existingLocations = useMemo(() => getDomainLocations(tracked), [tracked]);
   const isLoadingAddData = showAddStep && (
      trackedQuery.isPending || trackedQuery.isFetching || settingsQuery.isPending || settingsQuery.isFetching
      || (isResearch && (domainQuery.isPending || domainQuery.isFetching))
   );
   const hasAddDataError = showAddStep && (trackedQuery.isError || settingsQuery.isError || (isResearch && domainQuery.isError));
   const retryAddData = () => {
      void Promise.all([trackedQuery.refetch(), settingsQuery.refetch(), ...(isResearch ? [domainQuery.refetch()] : [])]);
   };

   const emptyMessage = !adwordsConnected ? (
      <>Google Ads has not been integrated yet. Follow <a className="text-primary underline" href={DOCS_URL} target="_blank" rel="noreferrer">these steps</a> to integrate it.</>
   ) : noIdeasDatabase ? 'No keyword ideas have been generated yet. Click the "Load Ideas" button to generate keyword ideas.'
      : rows.length === 0 && showFavorites ? 'No favorite keyword ideas yet.'
         : rows.length === 0 ? 'No keyword ideas found. Try generating keyword ideas again with the "Load Ideas" button.'
            : 'No keyword ideas match these filters.';

   return (
      <div className="bg-card rounded-xl border shadow-sm" data-testid="domKeywords">
         {selectedIds.length > 0 ? (
            <AddToTrackerBar
               selectedCount={selectedIds.length}
               label={isResearch ? 'Select a domain for the action' : undefined}
               devices={devices}
               onDevicesChange={setDevices}
               onAdd={openAddStep}
               // Stays clickable without a domain: the click explains that one has to be picked.
               addDisabled={devices.length === 0}
               onEmail={sendEmail}
               emailDisabled={isEmailing}
               onClear={clearSelection}
            >
               {isResearch && (
                  <Select value={pickedDomain || undefined} onValueChange={setPickedDomain}>
                     <SelectTrigger size="sm" className="w-52 max-sm:w-full" aria-label="Domain to add to" data-testid="target_domain"><SelectValue placeholder="Select a domain" /></SelectTrigger>
                     <SelectContent>
                        {domains.length === 0 && <p className="text-muted-foreground px-2 py-1.5 text-xs">No domains found</p>}
                        {domains.map((d) => <SelectItem key={d.slug} value={d.domain}>{d.domain}</SelectItem>)}
                     </SelectContent>
                  </Select>
               )}
            </AddToTrackerBar>
         ) : (
            <div className="flex flex-wrap items-center gap-2 p-4 lg:flex-row lg:justify-between lg:gap-3">
               <div className="flex items-center gap-1" role="tablist" aria-label="Keyword ideas">
                  {([['all', 'All Keywords', Tags, ideas.length], ['favorites', 'Favorites', Star, favorites.length]] as const).map(([value, label, Icon, count]) => {
                     const active = (value === 'favorites') === showFavorites;
                     return (
                        <button
                           key={value}
                           type="button"
                           role="tab"
                           aria-selected={active}
                           data-testid={value === 'all' ? 'desktop_tab' : 'mobile_tab'}
                           className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors', active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}
                           onClick={() => onShowFavorites(value === 'favorites')}
                        >
                           <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
                           <span className="bg-background rounded-full px-1.5 text-[0.7rem] font-semibold">{count}</span>
                        </button>
                     );
                  })}
               </div>
               <div className="max-lg:contents lg:flex lg:flex-wrap lg:items-center lg:gap-2">
                  {!showFavorites && (
                     <MultiSelect
                        label="Groups"
                        allLabel={`All Groups (${groups.length})`}
                        testId="tags_filter"
                        className="max-lg:order-2 max-lg:min-w-0 max-lg:flex-1 max-lg:basis-[calc(50%-0.25rem)]"
                        options={groups.map((group) => ({ label: group, value: group }))}
                        selected={filters.groups}
                        onChange={(next) => startTransition(() => setFilters({ ...filters, groups: next }))}
                        emptyMessage="No groups found"
                     />
                  )}
                  <div className="relative max-lg:order-1 max-lg:min-w-28 max-lg:flex-1 max-lg:basis-28">
                     <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                     <Input data-testid="filter_input" className="h-8 w-full pl-8 lg:w-44" placeholder="Filter keywords..." value={filters.search} onChange={(event) => startTransition(() => setFilters({ ...filters, search: event.target.value }))} />
                  </div>
                  <Select value={ideaChoiceFor(userSort) || undefined} onValueChange={(value) => startTransition(() => setUserSort(ideaSortingFor(value)))}>
                     <SelectTrigger size="sm" className="w-full max-lg:order-2 max-lg:min-w-0 max-lg:flex-1 max-lg:basis-[calc(50%-0.25rem)] lg:w-48" data-testid="sort_button" aria-label="Sort keyword ideas"><SelectValue placeholder="Sorted by column" /></SelectTrigger>
                     <SelectContent align="end">{IDEA_SORT_CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
               </div>
            </div>
         )}

         <DataTable
            table={table}
            label="Keyword ideas"
            className="h-[calc(100dvh-26rem)] min-h-96"
            minWidth="38rem"
            isLoading={adwordsConnected && isLoading}
            emptyMessage={emptyMessage}
            estimateStackedHeight={120}
            renderStackedRow={(row) => (
               <div className="flex flex-col gap-3 px-4 py-4 text-sm">
                  <div className="flex items-start gap-2">
                     <span className="mt-0.5"><IdeaSelectCheckbox row={row} /></span>
                     <div className="min-w-0 flex-1">
                        <IdeaKeywordCell
                           idea={row.original}
                           favorite={favoriteIds.has(row.original.uid)}
                           starAtEnd
                           config={{ favoriteIds, onOpenDetails: (idea) => setDetailsId(idea.uid), onToggleFavorite: (idea) => { if (!isFaving) { toggleFavorite({ keywordID: idea.uid }); } } }}
                        />
                     </div>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 pl-7 text-xs">
                     <span className="text-foreground text-base font-semibold">{formattedNum(row.original.avgMonthlySearches ?? 0)}<span className="text-muted-foreground text-xs font-normal">/month</span></span>
                     <VolumeSparkline large volumes={row.original.monthlySearchVolumes} onClick={() => setDetailsId(row.original.uid)} />
                     <CompetitionBadge idea={row.original} />
                  </div>
               </div>
            )}
         />

         {detailsIdea && <IdeaDetails idea={detailsIdea} onClose={() => setDetailsId(null)} />}
         {showAddStep && (
            <AddToTrackerDialog
               selectedCount={selectedIdeas.length}
               existingTags={existingTags}
               existingLocations={existingLocations}
               allowsCity={allowsCity}
               isAdding={isAdding}
               isLoadingExisting={isLoadingAddData}
               existingLoadError={hasAddDataError}
               onRetryExisting={retryAddData}
               onConfirm={submitToTracker}
               onClose={() => setShowAddStep(false)}
            />
         )}
      </div>
   );
}
