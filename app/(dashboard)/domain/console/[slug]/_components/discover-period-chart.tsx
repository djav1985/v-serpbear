'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from 'components/ui/chart';

export type DiscoverPeriodPoint = {
   period: string;
   clicksPerDay: number | null;
   impressionsPerDay: number | null;
   position: number | null;
};

const CONFIG = {
   clicksPerDay: { label: 'Avg. clicks / day', color: 'var(--chart-1)' },
   impressionsPerDay: { label: 'Avg. impressions / day', color: 'var(--chart-2)' },
   position: { label: 'Avg. position', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Compares the keyword's cached averages for the 30-, 7-, and 3-day windows. */
export function DiscoverPeriodChart({ points }: { points: DiscoverPeriodPoint[] }) {
   return (
      <div className="flex h-[21rem] flex-col gap-2 sm:h-80">
         <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full shrink-0 animate-in fade-in-0 duration-1000 motion-reduce:animate-none">
            <LineChart data={points} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
               <CartesianGrid vertical={false} />
               <XAxis dataKey="period" tickLine={false} axisLine={false} />
               <YAxis yAxisId="clicks" hide />
               <YAxis yAxisId="impressions" hide />
               <YAxis yAxisId="position" hide />
               <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
               <Line yAxisId="clicks" dataKey="clicksPerDay" type="monotone" stroke="var(--color-clicksPerDay)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
               <Line yAxisId="impressions" dataKey="impressionsPerDay" type="monotone" stroke="var(--color-impressionsPerDay)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
               <Line yAxisId="position" dataKey="position" type="monotone" stroke="var(--color-position)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
         </ChartContainer>
         <div className="text-muted-foreground grid h-12 shrink-0 grid-cols-2 items-center gap-x-3 text-xs sm:flex sm:h-8 sm:flex-wrap sm:gap-x-4">
            {Object.entries(CONFIG).map(([key, value]) => (
               <span key={key} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="size-2 rounded-full" style={{ backgroundColor: value.color }} aria-hidden="true" />
                  {value.label}
               </span>
            ))}
         </div>
         <p className="text-muted-foreground h-4 shrink-0 truncate text-xs leading-4">Each line uses its own scale. Hover for actual averages.</p>
      </div>
   );
}
