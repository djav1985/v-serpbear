'use client';

import { useMemo, ViewTransition } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'components/ui/sheet';
import countries from 'utils/countries';
import { formatInZone } from 'utils/timezone';
import { getAppTimezone } from 'utils/client/appTimezone';
import type { DiscoverPeriodPoint } from './discover-period-chart';

const DiscoverPeriodChart = dynamic(() => import('./discover-period-chart').then((module) => module.DiscoverPeriodChart), {
   loading: () => <div aria-hidden="true" className="h-[21rem] w-full sm:h-80" />,
});

const WINDOWS = [
   { key: 'thirtyDays', days: 30, label: '30 days' },
   { key: 'sevenDays', days: 7, label: '7 days' },
   { key: 'threeDays', days: 3, label: '3 days' },
] as const;

type DiscoverKeywordDetailsProps = {
   keyword: SearchAnalyticsItem;
   periodRows: Record<(typeof WINDOWS)[number]['key'], SearchAnalyticsItem[]>;
   lastFetched?: string;
   onClose: () => void;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function DiscoverKeywordDetails({ keyword, periodRows, lastFetched, onClose }: DiscoverKeywordDetailsProps) {
   const chartPoints = useMemo(() => WINDOWS.map(({ key, days, label }) => {
      const matches = periodRows[key].filter((row) => row.uid === keyword.uid || (
         normalize(row.keyword) === normalize(keyword.keyword)
         && normalize(row.country) === normalize(keyword.country)
         && normalize(row.device) === normalize(keyword.device)
      ));
      if (matches.length === 0) {
         return { period: label, clicksPerDay: null, impressionsPerDay: null, position: null } satisfies DiscoverPeriodPoint;
      }

      const clicks = matches.reduce((sum, row) => sum + row.clicks, 0);
      const impressions = matches.reduce((sum, row) => sum + row.impressions, 0);
      const weightedPosition = matches.reduce((sum, row) => sum + row.position * row.impressions, 0);
      const positionSum = matches.reduce((sum, row) => sum + row.position, 0);

      return {
         period: label,
         clicksPerDay: Math.round((clicks / days) * 100) / 100,
         impressionsPerDay: Math.round((impressions / days) * 100) / 100,
         position: Math.round((impressions > 0 ? weightedPosition / impressions : positionSum / matches.length) * 100) / 100,
      } satisfies DiscoverPeriodPoint;
   }), [keyword, periodRows]);

   const updated = lastFetched
      ? formatInZone(lastFetched, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone())
      : '';

   return (
      <Sheet open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="DiscoverKeywordDetails">
            <SheetHeader className="border-b">
               <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className={`fflag fflag-${keyword.country} h-[12px] w-[18px] shrink-0`} title={countries[keyword.country]?.[0] ?? keyword.country} />
                  <span className="min-w-0 truncate">{keyword.keyword}</span>
                  <span className="bg-accent text-accent-foreground shrink-0 rounded px-2 py-1 text-xs font-bold capitalize">{keyword.device}</span>
               </SheetTitle>
               <SheetDescription className="sr-only">Search Console performance by period and Google search results for this keyword.</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-8 p-4">
               <section>
                  <h3 className="mb-4 text-lg font-bold">Search Console Performance</h3>
                  <ViewTransition default="none">
                     <DiscoverPeriodChart points={chartPoints} />
                  </ViewTransition>
               </section>

               <section>
                  <div className="mb-4 flex items-center justify-between border-b pb-3">
                     <h3 className="flex items-center gap-1 font-bold">
                        Google Search Result
                        <a className="text-muted-foreground hover:text-foreground px-1" aria-label="Open this search on Google" href={`https://www.google.com/search?q=${encodeURIComponent(keyword.keyword)}`} target="_blank" rel="noreferrer">
                           <ExternalLink className="size-3.5" />
                        </a>
                     </h3>
                     <span className="text-muted-foreground text-xs">{updated}</span>
                  </div>

                  <Button asChild>
                     <a href={`https://www.google.com/search?q=${encodeURIComponent(keyword.keyword)}`} target="_blank" rel="noreferrer">
                        <Search />
                        View Google search results for &quot;{keyword.keyword}&quot;
                     </a>
                  </Button>
               </section>
            </div>
         </SheetContent>
      </Sheet>
   );
}
