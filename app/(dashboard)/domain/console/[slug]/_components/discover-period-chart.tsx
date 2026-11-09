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
   clicksPerDay: { label: 'Average clicks / day', color: 'var(--chart-1)' },
   impressionsPerDay: { label: 'Average impressions / day', color: 'var(--chart-2)' },
   position: { label: 'Average position', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Compares the keyword's cached averages for the 30-, 7-, and 3-day windows. */
export function DiscoverPeriodChart({ points }: { points: DiscoverPeriodPoint[] }) {
   return (
      <div className="space-y-2">
         <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full animate-in fade-in-0 duration-1000 motion-reduce:animate-none">
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
         <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Object.entries(CONFIG).map(([key, value]) => (
               <span key={key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: value.color }} aria-hidden="true" />
                  {value.label}
               </span>
            ))}
         </div>
         <p className="text-muted-foreground text-xs">Each line uses its own scale. Hover for the actual average values.</p>
      </div>
   );
}
