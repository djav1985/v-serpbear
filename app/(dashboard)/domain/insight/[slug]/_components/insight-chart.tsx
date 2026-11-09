'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from 'components/ui/chart';
import { formattedNum } from 'utils/client/helpers';
import { formatDateKey } from 'utils/timezone';

const CONFIG = {
   clicks: { label: 'Visits', color: 'var(--chart-1)' },
   impressions: { label: 'Impressions', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** Visits on the left axis and impressions on the right, because their sizes are far apart. */
export function InsightChart({ stats }: { stats: SearchAnalyticsStat[] }) {
   const data = stats.map((item) => ({
      label: `${formatDateKey(item.date, { day: 'numeric' })}-${formatDateKey(item.date, { month: 'short' })}`,
      clicks: item.clicks,
      impressions: item.impressions,
   }));
   return (
      <ChartContainer config={CONFIG} className="aspect-auto h-72 w-full animate-in fade-in-0 duration-1000 motion-reduce:animate-none">
         <LineChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis yAxisId="clicks" tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => formattedNum(value)} />
            <YAxis yAxisId="impressions" orientation="right" tickLine={false} axisLine={false} width={52} tickFormatter={(value: number) => formattedNum(value)} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Line yAxisId="clicks" dataKey="clicks" type="monotone" stroke="var(--color-clicks)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="impressions" dataKey="impressions" type="monotone" stroke="var(--color-impressions)" strokeWidth={2} dot={false} isAnimationActive={false} />
         </LineChart>
      </ChartContainer>
   );
}
