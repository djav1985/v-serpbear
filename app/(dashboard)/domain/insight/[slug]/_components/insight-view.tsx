'use client';

import { startTransition, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTable, type ColumnDef } from '@tanstack/react-table';
import { DataTable } from 'app/(dashboard)/_components/data-table/data-table';
import { dataTableFeatures, type DataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { Card, CardContent } from 'components/ui/card';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { cn } from 'lib/utils';
import { apiGet } from 'utils/client/apiClient';
import { formattedNum } from 'utils/client/helpers';
import countries from 'utils/countries';
import { sortInsightItems } from 'utils/insight';
import { formatDateKey } from 'utils/timezone';
import { DomainHeader } from '../../../_components/domain-header';
import { DomainSettingsDialog } from '../../../_components/domain-settings-dialog';
import { InsightChart } from './insight-chart';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];
type Tab = 'stats' | 'keywords' | 'countries' | 'pages';
const TABS: Tab[] = ['stats', 'keywords', 'countries', 'pages'];
const DOCS_URL = 'https://github.com/djav1985/v-serpbear/wiki/Google-Integrations';
const EMPTY: InsightDataType = { stats: null, keywords: [], countries: [], pages: [] };

const percent = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' });

type InsightColumn = ColumnDef<DataTableFeatures, SCInsightItem>;
const center = { cellClassName: 'justify-center text-center' };

const metricColumns: InsightColumn[] = [
   { id: 'position', header: 'Avg Position', enableSorting: false, meta: { width: '7rem', ...center }, cell: ({ row }) => Math.round(row.original.position) },
   { id: 'clicks', header: 'Visits', enableSorting: false, meta: { width: '6rem', ...center }, cell: ({ row }) => formattedNum(row.original.clicks) },
   { id: 'impressions', header: 'Impressions', enableSorting: false, meta: { width: '7rem', ...center }, cell: ({ row }) => formattedNum(row.original.impressions) },
   { id: 'ctr', header: 'CTR', enableSorting: false, meta: { width: '6rem', ...center }, cell: ({ row }) => `${percent.format(row.original.ctr)}%` },
];
const countColumn = (id: string, header: string, pick: (item: SCInsightItem) => number | undefined): InsightColumn => ({
   id, header, enableSorting: false, meta: { width: '6rem', ...center }, cell: ({ row }) => formattedNum(pick(row.original) ?? 0),
});

const columnsFor = (tab: Tab, domain: string): InsightColumn[] => {
   const first: InsightColumn = {
      id: 'name',
      header: { stats: 'Date', keywords: 'Keyword', countries: 'Country', pages: 'Page' }[tab],
      enableSorting: false,
      meta: { width: 'minmax(12rem, 3fr)' },
      cell: ({ row }) => {
         const item = row.original;
         if (tab === 'stats') { return <span className="font-medium">{item.date ? formatDateKey(item.date, { dateStyle: 'medium' }) : ''}</span>; }
         if (tab === 'countries') {
            const code = item.country ?? 'zzz';
            return (
               <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span className={`fflag fflag-${code} h-[12px] w-[18px] shrink-0`} />
                  <span className="truncate">{countries[code]?.[0] ?? code}</span>
               </span>
            );
         }
         if (tab === 'pages') {
            return domain
               ? <a className="hover:text-primary truncate font-medium" href={`https://${domain}${item.page}`} target="_blank" rel="noreferrer" title={item.page}>{item.page}</a>
               : <span className="truncate font-medium">{item.page}</span>;
         }
         return <span className="truncate font-medium" title={item.keyword}>{item.keyword}</span>;
      },
   };
   const extra: InsightColumn[] = [];
   if (tab === 'keywords' || tab === 'pages') { extra.push(countColumn('countries', 'Countries', (i) => i.countries)); }
   if (tab === 'countries' || tab === 'pages') { extra.push(countColumn('keywords', 'Keywords', (i) => i.keywords)); }
   return [first, ...metricColumns, ...extra];
};

function StatCard({ label, value, title, className }: { label: string; value: string; title?: string; className?: string }) {
   return (
      <Card className="py-4" title={title}>
         <CardContent className="px-4">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className={cn('text-2xl font-semibold', className)}>{value}</p>
         </CardContent>
      </Card>
   );
}

type InsightViewProps = {
   domain: DomainType;
   searchConsoleConnected: boolean;
   availableScrapers: Scraper[];
   systemScraperType: string;
};

export function InsightView({ domain, searchConsoleConnected, availableScrapers, systemScraperType }: InsightViewProps) {
   const [tab, setTab] = useState<Tab>('stats');
   const [settingsOpen, setSettingsOpen] = useState(false);

   const { data, isLoading, isError } = useQuery({
      queryKey: ['sc-insight', domain.domain],
      queryFn: async () => (await apiGet<{ data: InsightDataType }>(`/api/google/insight?domain=${encodeURIComponent(domain.domain)}`)).data,
      enabled: searchConsoleConnected,
      retry: false,
   });
   const insight = data ?? EMPTY;
   const stats = useMemo(() => insight.stats ?? [], [insight.stats]);

   const totals = useMemo(() => {
      const sums = stats.reduce((acc, item) => ({
         impressions: acc.impressions + item.impressions, clicks: acc.clicks + item.clicks, position: acc.position + item.position,
      }), { impressions: 0, clicks: 0, position: 0 });
      return { ...sums, ctr: sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : 0, avgPosition: sums.position ? Math.round(sums.position / stats.length) : 0 };
   }, [stats]);

   // The daily list reads newest first; the other lists read by visits.
   const rows = useMemo<SCInsightItem[]>(() => {
      if (tab === 'stats') { return [...stats].reverse(); }
      return sortInsightItems(insight[tab] ?? []);
   }, [tab, stats, insight]);
   const columns = useMemo(() => columnsFor(tab, domain.domain), [tab, domain.domain]);

   const table = useTable({ features: dataTableFeatures, data: rows, columns });

   const startDate = stats.length > 0 ? stats[0].date : null;
   const endDate = stats.length > 0 ? stats[stats.length - 1].date : null;
   const emptyMessage = !searchConsoleConnected ? (
      <>Google Search Console has not been integrated yet. Follow <a className="text-primary underline" href={DOCS_URL} target="_blank" rel="noreferrer">these steps</a> to integrate Google Search data for this domain.</>
   ) : isError ? 'Could not load Search Console insights for this domain.' : 'No data yet.';

   return (
      <div className="flex flex-col gap-4">
         <DomainHeader domain={domain} onOpenSettings={() => setSettingsOpen(true)} />

         <div className="bg-card rounded-xl border shadow-sm" data-testid="domKeywords">
            <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
               <div className="hidden items-center gap-1 lg:flex" role="tablist" aria-label="Insight sections">
                  {TABS.map((value) => (
                     <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        className={cn('rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap capitalize transition-colors', tab === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}
                        onClick={() => startTransition(() => setTab(value))}
                     >
                        {value}
                        {value !== 'stats' && <span className="bg-background ml-1.5 rounded-full px-1.5 text-[0.7rem] font-semibold">{insight[value]?.length ?? 0}</span>}
                     </button>
                  ))}
               </div>
               <div className="lg:hidden">
                  <Select value={tab} onValueChange={(value) => startTransition(() => setTab(value as Tab))}>
                     <SelectTrigger className="w-full capitalize" aria-label="Insight section"><SelectValue /></SelectTrigger>
                     <SelectContent>{TABS.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent>
                  </Select>
               </div>
               {searchConsoleConnected && startDate && endDate && (
                  <p className="text-muted-foreground text-sm">
                     {formatDateKey(startDate, { dateStyle: 'medium' })} - {formatDateKey(endDate, { dateStyle: 'medium' })} (Last 30 Days)
                  </p>
               )}
            </div>

            {searchConsoleConnected && tab === 'stats' && stats.length > 0 && (
               <div className="flex flex-col gap-4 border-t p-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                     <StatCard label="Visits" value={compact.format(totals.clicks)} title={`${formattedNum(totals.clicks)} Visits`} className="text-chart-1" />
                     <StatCard label="Impressions" value={compact.format(totals.impressions)} title={`${formattedNum(totals.impressions)} Impressions`} className="text-chart-2" />
                     <StatCard label="Avg Position" value={String(totals.avgPosition)} />
                     <StatCard label="Avg CTR" value={`${percent.format(totals.ctr)}%`} />
                     <StatCard label="Keywords" value={formattedNum(insight.keywords?.length ?? 0)} />
                     <StatCard label="Pages" value={formattedNum(insight.pages?.length ?? 0)} />
                  </div>
                  <InsightChart stats={stats} />
               </div>
            )}

            <DataTable
               table={table}
               label={`Search Console ${tab}`}
               className={cn('min-h-80', tab === 'stats' ? 'h-96' : 'h-[calc(100dvh-24rem)]')}
               minWidth="40rem"
               isLoading={searchConsoleConnected && isLoading}
               emptyMessage={emptyMessage}
               estimateStackedHeight={90}
               renderStackedRow={(row) => (
                  <div className="flex flex-col gap-2 px-4 py-4 text-sm">
                     <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate font-medium">
                           {tab === 'stats' && row.original.date && formatDateKey(row.original.date, { dateStyle: 'medium' })}
                           {tab === 'keywords' && row.original.keyword}
                           {tab === 'pages' && row.original.page}
                           {tab === 'countries' && (countries[row.original.country ?? 'zzz']?.[0] ?? row.original.country)}
                        </span>
                        <span className="font-semibold">{formattedNum(row.original.clicks)}<span className="text-muted-foreground text-xs font-normal"> visits</span></span>
                     </div>
                     <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        <span>Pos {Math.round(row.original.position)}</span>
                        <span>{formattedNum(row.original.impressions)} views</span>
                        <span>{percent.format(row.original.ctr)}% CTR</span>
                     </div>
                  </div>
               )}
            />
         </div>

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
