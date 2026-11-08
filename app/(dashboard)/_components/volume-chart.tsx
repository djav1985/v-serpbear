'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from 'components/ui/chart';
import { formattedNum } from 'utils/client/helpers';

const CONFIG = { volume: { label: 'Searches', color: 'var(--chart-1)' } } satisfies ChartConfig;

/** Monthly search volume over time. Higher is better, so the axis runs the normal way. */
export function VolumeChart({ labels, series, className }: { labels: string[]; series: number[]; className?: string }) {
   const data = labels.map((label, index) => ({ label, volume: series[index] }));
   return (
      <div className={className}>
         <ChartContainer config={CONFIG} className="aspect-auto h-full w-full">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
               <CartesianGrid vertical={false} />
               <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
               <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => formattedNum(value)} />
               <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
               <Area dataKey="volume" type="monotone" stroke="var(--color-volume)" fill="var(--color-volume)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} dot={{ r: 2 }} />
            </AreaChart>
         </ChartContainer>
      </div>
   );
}
