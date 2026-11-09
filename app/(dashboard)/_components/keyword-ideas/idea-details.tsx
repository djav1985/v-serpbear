'use client';

import { useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
   Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from 'components/ui/sheet';
import { cn } from 'lib/utils';
import { getAppTimezone } from 'utils/client/appTimezone';
import { formattedNum } from 'utils/client/helpers';
import { safeHttpUrl } from 'utils/client/safeUrl';
import countries from 'utils/countries';
import { formatInZone } from 'utils/timezone';
import { fetchSearchResults } from './ideas-queries';

const VolumeChart = dynamic(() => import('../volume-chart').then((module) => module.VolumeChart), {
   loading: () => <div role="status" aria-label="Loading chart" className="h-64 w-full animate-pulse motion-reduce:animate-none rounded-md bg-muted" />,
});

// "january-2025" becomes "Jan, 25".
const monthLabel = (dateKey: string): string => {
   const [month = '', year = ''] = dateKey.split('-');
   return `${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}, ${year.slice(2)}`;
};

export function IdeaDetails({ idea, onClose }: { idea: IdeaKeyword; onClose: () => void }) {
   const foundRef = useRef<HTMLDivElement>(null);
   const updated = idea.updated ? formatInZone(idea.updated, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone()) : '';

   // The live Google search costs a request, so it only runs when the user asks for it.
   const search = useQuery({
      queryKey: ['idea-search', idea.uid] as const,
      queryFn: () => fetchSearchResults({ keyword: idea.keyword, country: idea.country, device: 'desktop' }),
      enabled: false,
      refetchOnWindowFocus: false,
   });
   const results = useMemo(() => search.data?.searchResult?.results ?? [], [search.data]);

   const chart = useMemo(() => {
      const keys = Object.keys(idea.monthlySearchVolumes ?? {});
      return { labels: keys.map(monthLabel), series: keys.map((key) => parseInt(idea.monthlySearchVolumes[key], 10)) };
   }, [idea.monthlySearchVolumes]);

   useEffect(() => { foundRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [results]);

   return (
      <Sheet open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="IdeaDetails">
            <SheetHeader className="border-b">
               <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className={`fflag fflag-${idea.country} h-[12px] w-[18px] shrink-0`} title={countries[idea.country]?.[0] ?? idea.country} />
                  <span className="min-w-0 truncate">{idea.keyword}</span>
                  <span className="bg-accent text-accent-foreground shrink-0 rounded px-2 py-1 text-xs font-bold">{formattedNum(idea.avgMonthlySearches)}/month</span>
               </SheetTitle>
               <SheetDescription className="sr-only">Search volume trend for this keyword idea.</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-8 p-4">
               <section>
                  <h3 className="mb-4 text-lg font-bold">Search Volume Trend</h3>
                  <VolumeChart className="h-64" labels={chart.labels} series={chart.series} />
               </section>

               <section>
                  <div className="mb-4 flex items-center justify-between border-b pb-3">
                     <h3 className="flex items-center gap-1 font-bold">
                        Google Search Result
                        <a className="text-muted-foreground hover:text-foreground px-1" aria-label="Open this search on Google" href={`https://www.google.com/search?q=${encodeURIComponent(idea.keyword)}`} target="_blank" rel="noreferrer">
                           <ExternalLink className="size-3.5" />
                        </a>
                     </h3>
                     <span className="text-muted-foreground text-xs">{updated}</span>
                  </div>

                  {!search.data && (
                     <div className="flex flex-col items-center gap-3 py-8 text-center text-sm font-medium">
                        <p>View Google search results for &quot;{idea.keyword}&quot;</p>
                        <Button onClick={() => search.refetch()} disabled={search.isFetching}>
                           {search.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
                           {search.isFetching ? 'Performing Google search' : 'Perform Google Search'}
                        </Button>
                        {search.isError && <p role="alert" className="text-destructive text-xs">Could not run the search. Try again.</p>}
                     </div>
                  )}

                  {results.map((item, index) => {
                     const url = safeHttpUrl(item.url);
                     const isOwn = idea.position > 0 && idea.position < 100 && index === idea.position - 1;
                     return (
                        <div key={`${item.url}${item.position}`} ref={isOwn ? foundRef : null} className={cn('mb-3 rounded-md p-3 text-sm break-all', isOwn && 'border border-amber-200 bg-amber-50')}>
                           <h4 className="text-primary font-semibold">{url ? <a href={url} target="_blank" rel="noreferrer">{`${index + 1}. ${item.title}`}</a> : `${index + 1}. ${item.title}`}</h4>
                           {url ? <a className="text-muted-foreground" href={url} target="_blank" rel="noreferrer">{item.url}</a> : <span className="text-muted-foreground">{item.url}</span>}
                        </div>
                     );
                  })}
               </section>
            </div>
         </SheetContent>
      </Sheet>
   );
}
