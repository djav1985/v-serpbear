import { Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateChartBounds } from '../../utils/client/chartBounds';
import {
   registerLineChart,
   BASE_CHART_OPTIONS,
   getYAxisBounds,
   CHART_DATASET_ID_KEY,
   LINE_DATASET_COLORS,
   HIDDEN_AXIS_OPTIONS,
} from './chartSetup';

// The slim sparkline fills the area under the line, so it also needs the Filler plugin.
registerLineChart(Filler);

type ChartProps = {
   labels: string[];
   series: number[];
   noMaxLimit?: boolean;
   reverse?: boolean;
   fillContainer?: boolean;
   mapSentinel?: boolean;
};

const ChartSlim = ({ labels, series, noMaxLimit = false, reverse = true, fillContainer = false, mapSentinel = false }: ChartProps) => {
   const chartSeries = mapSentinel ? series.map(v => (v === 111 ? null : v)) : series;
   const { min, max } = calculateChartBounds(mapSentinel ? series.filter(v => v !== 111) : series, { reverse, noMaxLimit });
   const options = {
      ...BASE_CHART_OPTIONS,
      layout: {
         padding: 0,
         autoPadding: false,
      },
      scales: {
         y: {
            ...HIDDEN_AXIS_OPTIONS,
            ...getYAxisBounds(reverse, min, max),
         },
         x: {
            ...HIDDEN_AXIS_OPTIONS,
            offset: false,
         },
      },
      plugins: {
         tooltip: {
            enabled: false,
         },
         legend: {
            display: false,
         },
      },
   };

   const wrapperClasses = fillContainer ? 'w-full h-full' : 'w-[80px] h-[30px]';
   const lineClasses = fillContainer ? 'w-full h-full' : '';

   return (
      <div className={`${wrapperClasses} rounded border border-gray-200`}>
         <Line
            datasetIdKey={CHART_DATASET_ID_KEY}
            className={lineClasses}
            options={options}
            data={{
               labels,
               datasets: [
                  {
                     fill: 'start',
                     showLine: true,
                     data: chartSeries,
                     pointRadius: 0,
                     ...LINE_DATASET_COLORS,
                     spanGaps: false,
                  },
               ],
            }}
         />
      </div>
   );
};

export default ChartSlim;
