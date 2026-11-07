'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from 'components/ui/chart';
import { calculateChartBounds } from 'utils/client/chartBounds';
import { formatDateKey } from 'utils/timezone';

const CONFIG = { position: { label: 'Position', color: 'var(--chart-1)' } } satisfies ChartConfig;

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };

// 0 and 111 both mean "not ranked that day". They become gaps in the line, not points at the bottom.
const toPoint = (value: number): number | null => (value > 0 && value < 111 ? value : null);

type PositionChartProps = {
   labels: string[];
   series: number[];
   className?: string;
};

/** A rank over time. Rank 1 is at the top, so a better position is higher on the chart. */
export function PositionChart({ labels, series, className }: PositionChartProps) {
   const data = labels.map((label, index) => ({ label, position: toPoint(series[index]) }));
   const { min, max } = calculateChartBounds(series, { reverse: true });
   const hasPoints = data.some((point) => point.position !== null);

   return (
      <div className={className}>
         <ChartContainer config={CONFIG} className="aspect-auto h-full w-full">
            <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
               <CartesianGrid vertical={false} />
               <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(label: string) => formatDateKey(label, SHORT_DATE)}
               />
               <YAxis reversed domain={[min, max ?? 100]} allowDecimals={false} tickLine={false} axisLine={false} width={32} />
               <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={(label) => formatDateKey(String(label), LONG_DATE)} indicator="line" />}
               />
               <Area
                  dataKey="position"
                  type="monotone"
                  stroke="var(--color-position)"
                  fill="var(--color-position)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 2 }}
               />
            </AreaChart>
         </ChartContainer>
         {!hasPoints && <p className="text-muted-foreground -mt-24 text-center text-sm">Not ranked in this period.</p>}
      </div>
   );
}
