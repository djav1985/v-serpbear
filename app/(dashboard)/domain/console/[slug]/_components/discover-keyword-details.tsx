'use client';

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'components/ui/sheet';
import { formattedNum } from 'utils/client/helpers';
import countries from 'utils/countries';
import { formatDateKey } from 'utils/timezone';

type DiscoverKeywordDetailsProps = {
   keyword: SearchAnalyticsItem;
   sevenDayRows: SearchAnalyticsItem[];
   onClose: () => void;
};

export function DiscoverKeywordDetails({ keyword, sevenDayRows, onClose }: DiscoverKeywordDetailsProps) {
   const { days, pages, totals } = useMemo(() => {
      const matchingRows = sevenDayRows.filter((row) => row.keyword === keyword.keyword && row.country === keyword.country && row.device === keyword.device);
      const daily = new Map<string, { clicks: number; impressions: number; weightedPosition: number; positionSum: number; count: number }>();
      const pageTotals = new Map<string, { clicks: number; impressions: number }>();

      matchingRows.forEach((row) => {
         if (row.date) {
            const day = daily.get(row.date) ?? { clicks: 0, impressions: 0, weightedPosition: 0, positionSum: 0, count: 0 };
            day.clicks += row.clicks;
            day.impressions += row.impressions;
            day.weightedPosition += row.position * row.impressions;
            day.positionSum += row.position;
            day.count += 1;
            daily.set(row.date, day);
         }
         if (row.page) {
            const page = pageTotals.get(row.page) ?? { clicks: 0, impressions: 0 };
            page.clicks += row.clicks;
            page.impressions += row.impressions;
            pageTotals.set(row.page, page);
         }
      });

      const days = [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({
         date,
         ...value,
         position: value.impressions > 0 ? value.weightedPosition / value.impressions : value.positionSum / value.count,
         ctr: value.impressions > 0 ? (value.clicks / value.impressions) * 100 : 0,
      }));
      const clicks = matchingRows.reduce((sum, row) => sum + row.clicks, 0);
      const impressions = matchingRows.reduce((sum, row) => sum + row.impressions, 0);
      const weightedPosition = matchingRows.reduce((sum, row) => sum + row.position * row.impressions, 0);
      const positionSum = matchingRows.reduce((sum, row) => sum + row.position, 0);
      const pages = [...pageTotals.entries()].map(([page, value]) => ({ page, ...value })).sort((left, right) => right.clicks - left.clicks).slice(0, 5);

      return {
         days,
         pages,
         totals: {
            clicks,
            impressions,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            position: impressions > 0 ? weightedPosition / impressions : (matchingRows.length > 0 ? positionSum / matchingRows.length : 0),
         },
      };
   }, [keyword, sevenDayRows]);

   return (
      <Sheet open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="DiscoverKeywordDetails">
            <SheetHeader className="border-b">
               <SheetTitle className="flex items-center gap-2 pr-8">
                  <span className={`fflag fflag-${keyword.country} h-[12px] w-[18px] shrink-0`} title={countries[keyword.country]?.[0] ?? keyword.country} />
                  <span className="min-w-0 truncate">{keyword.keyword}</span>
               </SheetTitle>
               <SheetDescription>Google Search Console performance for the last 7 days · {keyword.device}</SheetDescription>
            </SheetHeader>

            {days.length === 0 ? (
               <p className="text-muted-foreground p-4 text-sm">No daily Search Console details are available for this keyword.</p>
            ) : (
               <div className="flex flex-col gap-6 p-4">
                  <section>
                     <h3 className="mb-3 font-semibold">7-day performance</h3>
                     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                           ['Clicks', formattedNum(totals.clicks)],
                           ['Impressions', formattedNum(totals.impressions)],
                           ['CTR', `${totals.ctr.toFixed(2)}%`],
                           ['Avg position', totals.position.toFixed(1)],
                        ].map(([label, value]) => (
                           <div key={label} className="bg-accent/60 rounded-md p-3">
                              <p className="text-muted-foreground text-xs">{label}</p>
                              <p className="mt-1 font-semibold">{value}</p>
                           </div>
                        ))}
                     </div>
                  </section>

                  <section>
                     <h3 className="mb-3 font-semibold">Daily performance</h3>
                     <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-muted/60 text-muted-foreground text-xs">
                              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Clicks</th><th className="px-3 py-2 text-right">Impressions</th><th className="px-3 py-2 text-right">CTR</th><th className="px-3 py-2 text-right">Position</th></tr>
                           </thead>
                           <tbody>
                              {days.map((day) => (
                                 <tr key={day.date} className="border-t">
                                    <td className="px-3 py-2 whitespace-nowrap">{formatDateKey(day.date, { month: 'short', day: 'numeric' })}</td>
                                    <td className="px-3 py-2 text-right">{formattedNum(day.clicks)}</td>
                                    <td className="px-3 py-2 text-right">{formattedNum(day.impressions)}</td>
                                    <td className="px-3 py-2 text-right">{day.ctr.toFixed(2)}%</td>
                                    <td className="px-3 py-2 text-right">{day.position.toFixed(1)}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </section>

                  {pages.length > 0 && (
                     <section>
                        <h3 className="mb-3 font-semibold">Top pages</h3>
                        <div className="flex flex-col divide-y rounded-md border">
                           {pages.map((page) => (
                              <div key={page.page} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm">
                                 <span className="min-w-0 truncate" title={page.page}>{page.page}</span>
                                 <span className="text-muted-foreground shrink-0 text-xs">{formattedNum(page.clicks)} clicks · {formattedNum(page.impressions)} impressions</span>
                              </div>
                           ))}
                        </div>
                     </section>
                  )}
               </div>
            )}
         </SheetContent>
      </Sheet>
   );
}
