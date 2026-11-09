'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink } from 'lucide-react';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import {
   Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from 'components/ui/sheet';
import { cn } from 'lib/utils';
import { getAppTimezone } from 'utils/client/appTimezone';
import { generateTheChartData } from 'utils/client/generateChartData';
import { safeHttpUrl } from 'utils/client/safeUrl';
import countries from 'utils/countries';
import { formatInZone } from 'utils/timezone';
import { useKeywordDetails } from '../../_components/keyword-queries';

const PositionChart = dynamic(() => import('app/(dashboard)/_components/position-chart').then((module) => module.PositionChart), {
   loading: () => <div role="status" aria-label="Loading chart" className="h-64 w-full animate-pulse motion-reduce:animate-none rounded-md bg-muted" />,
});

const RANGE_OPTIONS = [
   { label: 'Last 7 Days', value: '7' },
   { label: 'Last 30 Days', value: '30' },
   { label: 'Last 90 Days', value: '90' },
   { label: '1 Year', value: '360' },
   { label: 'All Time', value: 'all' },
];

type ResultLinkProps = { position: number; title: string; rawUrl: string };

function ResultLink({ position, title, rawUrl }: ResultLinkProps) {
   const url = safeHttpUrl(rawUrl);
   const heading = `${position}. ${title}`;
   return (
      <>
         <h4 className="text-primary font-semibold">
            {url ? <a href={url} target="_blank" rel="noreferrer">{heading}</a> : heading}
         </h4>
         {url
            ? <a className="text-muted-foreground" href={url} target="_blank" rel="noreferrer">{url}</a>
            : rawUrl && <span className="text-muted-foreground">{String(rawUrl)}</span>}
      </>
   );
}

type KeywordDetailsProps = { keyword: KeywordType; onClose: () => void };

/** A side sheet with one keyword's position history and the stored search results. */
export function KeywordDetails({ keyword, onClose }: KeywordDetailsProps) {
   const [range, setRange] = useState('30');
   const foundRef = useRef<HTMLDivElement>(null);
   const { data } = useKeywordDetails(keyword.ID);

   const history = useMemo<KeywordHistory>(() => data?.history || keyword.history || {}, [data, keyword.history]);
   const searchResults = useMemo<KeywordLastResult[]>(() => {
      if (Array.isArray(data?.searchResult)) { return data.searchResult as KeywordLastResult[]; }
      return Array.isArray(keyword.lastResult) ? keyword.lastResult : [];
   }, [data, keyword.lastResult]);
   const localResults: KeywordLocalResult[] = Array.isArray(data?.localResults) ? (data?.localResults as KeywordLocalResult[]) : (Array.isArray(keyword.localResults) ? keyword.localResults : []);
   const mapPackTop3 = Boolean(data?.mapPackTop3 ?? keyword.mapPackTop3);
   const chart = useMemo(() => generateTheChartData(history, range), [history, range]);
   const updated = keyword.lastUpdated ? formatInZone(keyword.lastUpdated, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone()) : '';

   // Stored results are contiguous, so the count is how many results were checked.
   const checked = searchResults.length;
   const notFoundLabel = checked > 0 ? `Not in First ${checked}` : 'No Results';

   useEffect(() => {
      if (keyword.position > 0) { foundRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' }); }
   }, [searchResults, keyword.position]);

   return (
      <Sheet open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="keywordDetails">
            <SheetHeader className="border-b">
               <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className="fflag-stack shrink-0">
                     <span className={`fflag fflag-${keyword.country} h-[12px] w-[18px]`} title={countries[keyword.country]?.[0] ?? keyword.country} />
                     {mapPackTop3 && <span className="fflag fflag-map-pack h-[12px] w-[18px]" role="img" aria-label="Map pack top three" />}
                  </span>
                  <span className="min-w-0 truncate">{keyword.keyword}</span>
                  <span className={cn('bg-accent shrink-0 rounded px-2 py-1 text-xs font-bold', keyword.position === 0 ? 'text-muted-foreground' : 'text-accent-foreground')}>
                     {keyword.position === 0 ? notFoundLabel : keyword.position}
                  </span>
               </SheetTitle>
               <SheetDescription className="sr-only">Position history and search results for this keyword.</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-8 p-4">
               <section>
                  <div className="mb-4 flex items-center justify-between">
                     <h3 className="text-lg font-bold">SERP History</h3>
                     <Select value={range} onValueChange={setRange}>
                        <SelectTrigger size="sm" className="w-36" aria-label="History range"><SelectValue /></SelectTrigger>
                        <SelectContent>{RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                     </Select>
                  </div>
                  <PositionChart className="h-64" labels={chart.labels} series={chart.series} />
               </section>

               <section>
                  <div className="mb-4 flex items-center justify-between border-b pb-3">
                     <h3 className="font-bold">Local Search Results</h3>
                     <span className="text-muted-foreground text-xs">{updated}</span>
                  </div>
                  {localResults.length > 0 ? localResults.map((item, index) => {
                     const position = item.position || index + 1;
                     const title = item.title || (item.name as string | undefined) || `Local Result ${position}`;
                     const rawUrl = item.url || (item.website as string | undefined) || (item.link as string | undefined)
                        || (item.business_website as string | undefined) || (item.place_link as string | undefined) || '';
                     return (
                        <div
                           key={`${rawUrl}${position}`}
                           data-own={item.isOwn ? 'true' : 'false'}
                           className={cn('mb-3 rounded-md border p-3 text-sm break-all', item.isOwn ? 'border-emerald-200 bg-emerald-50' : 'bg-muted/40')}
                        >
                           <ResultLink position={position} title={title} rawUrl={rawUrl} />
                        </div>
                     );
                  }) : <p className="text-muted-foreground text-sm">N/A</p>}
               </section>

               <section>
                  <div className="mb-4 flex items-center justify-between border-b pb-3">
                     <h3 className="flex items-center gap-1 font-bold">
                        Google Search Result
                        <a
                           className="text-muted-foreground hover:text-foreground px-1"
                           aria-label="Open this search on Google"
                           href={`https://www.google.com/search?q=${encodeURIComponent(keyword.keyword)}`}
                           target="_blank"
                           rel="noreferrer"
                        >
                           <ExternalLink className="size-3.5" />
                        </a>
                     </h3>
                     <span className="text-muted-foreground text-xs">{updated}</span>
                  </div>
                  {searchResults.map((item) => {
                     const isOwn = keyword.position > 0 && item.position === keyword.position;
                     return (
                        <div
                           key={`${item.url}${item.position}`}
                           ref={isOwn ? foundRef : null}
                           className={cn('mb-3 rounded-md p-3 text-sm break-all', isOwn && 'border border-emerald-200 bg-emerald-50')}
                        >
                           <ResultLink position={item.position} title={item.title} rawUrl={item.url} />
                        </div>
                     );
                  })}
               </section>
            </div>
         </SheetContent>
      </Sheet>
   );
}
