'use client';

import { useMemo, ViewTransition } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, Search } from 'lucide-react';
import {
   Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from 'components/ui/sheet';
import { getAppTimezone } from 'utils/client/appTimezone';
import { formattedNum } from 'utils/client/helpers';
import countries from 'utils/countries';
import { formatInZone } from 'utils/timezone';

const VolumeChart = dynamic(() => import('../volume-chart').then((module) => module.VolumeChart), {
   loading: () => <div aria-hidden="true" className="h-64 w-full" />,
});

// "january-2025" becomes "Jan, 25".
const monthLabel = (dateKey: string): string => {
   const [month = '', year = ''] = dateKey.split('-');
   return `${month.slice(0, 1).toUpperCase()}${month.slice(1, 3).toLowerCase()}, ${year.slice(2)}`;
};

export function IdeaDetails({ idea, onClose }: { idea: IdeaKeyword; onClose: () => void }) {
   const updated = idea.updated ? formatInZone(idea.updated, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone()) : '';

   const chart = useMemo(() => {
      const keys = Object.keys(idea.monthlySearchVolumes ?? {});
      return { labels: keys.map(monthLabel), series: keys.map((key) => parseInt(idea.monthlySearchVolumes[key], 10)) };
   }, [idea.monthlySearchVolumes]);

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
                  <ViewTransition default="none">
                     <VolumeChart className="h-64 animate-in fade-in-0 duration-1000 motion-reduce:animate-none" labels={chart.labels} series={chart.series} />
                  </ViewTransition>
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

                  <a className="text-primary inline-flex items-center gap-2 py-4 font-medium hover:underline" href={`https://www.google.com/search?q=${encodeURIComponent(idea.keyword)}`} target="_blank" rel="noreferrer">
                     <Search className="size-4" />
                     View Google search results for &quot;{idea.keyword}&quot;
                  </a>
               </section>
            </div>
         </SheetContent>
      </Sheet>
   );
}
