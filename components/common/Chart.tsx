import React from 'react';
import dynamic from 'next/dynamic';
import { calculateChartBounds } from '../../utils/client/chartBounds';
import { CHART_DATASET_KEY_MAIN } from '../../utils/constants';
import { ensureChartJsRegistered } from '../../utils/chartjs';

const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), { ssr: false });

type ChartProps = {
   labels: string[];
   series: number[];
   reverse?: boolean;
   noMaxLimit?: boolean;
};

const Chart = ({ labels, series, reverse = true, noMaxLimit = false }: ChartProps) => {
   ensureChartJsRegistered();
   const { min, max } = calculateChartBounds(series, { reverse, noMaxLimit });
   const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      scales: {
         y: {
            reverse,
            min,
            max,
         },
      },
      plugins: {
         legend: {
            display: false,
         },
      },
   };

   return (
      <Line
         datasetIdKey={CHART_DATASET_KEY_MAIN}
         options={options}
         data={{
            labels,
            datasets: [
               {
                  fill: 'start',
                  data: series,
                  borderColor: 'rgb(31, 205, 176)',
                  backgroundColor: 'rgba(31, 205, 176, 0.5)',
               },
            ],
         }}
      />
   );
};

export default Chart;
