import { Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateChartBounds } from '../../utils/client/chartBounds';
import {
   registerLineChart,
   BASE_CHART_OPTIONS,
   getYAxisBounds,
   CHART_DATASET_ID_KEY,
   LINE_DATASET_COLORS,
} from './chartSetup';

// The line fill ('start') needs the Filler plugin; register it here so it does not depend on ChartSlim being loaded.
registerLineChart(Filler);

type ChartProps = {
   labels: string[];
   series: number[];
   reverse?: boolean;
   noMaxLimit?: boolean;
};

const Chart = ({ labels, series, reverse = true, noMaxLimit = false }: ChartProps) => {
   const { min, max } = calculateChartBounds(series, { reverse, noMaxLimit });
   const options = {
      ...BASE_CHART_OPTIONS,
      scales: {
         y: getYAxisBounds(reverse, min, max),
      },
      plugins: {
         legend: {
            display: false,
         },
      },
   };

   return (
      <Line
         datasetIdKey={CHART_DATASET_ID_KEY}
         options={options}
         data={{
            labels,
            datasets: [
               {
                  fill: 'start',
                  data: series,
                  ...LINE_DATASET_COLORS,
               },
            ],
         }}
      />
   );
};

export default Chart;
