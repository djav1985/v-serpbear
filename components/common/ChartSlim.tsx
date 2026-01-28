import React from 'react';
import dynamic from 'next/dynamic';
import { calculateChartBounds } from '../../utils/client/chartBounds';
import { CHART_DATASET_KEY_SLIM } from '../../utils/constants';
import { ensureChartJsRegistered } from '../../utils/chartjs';

const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), { ssr: false });

type ChartProps = {
   labels: string[];
   series: number[];
   noMaxLimit?: boolean;
   reverse?: boolean;
   fillContainer?: boolean;
};

const ChartSlim = ({ labels, series, noMaxLimit = false, reverse = true, fillContainer = false }: ChartProps) => {
   ensureChartJsRegistered();
   const { min, max } = calculateChartBounds(series, { reverse, noMaxLimit });
   const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      layout: {
         padding: 0,
         autoPadding: false,
      },
      scales: {
         y: {
            display: false,
            reverse,
            min,
            max,
            grid: {
               display: false,
               drawBorder: false,
            },
            ticks: {
               display: false,
               padding: 0,
            },
            border: {
               display: false,
            },
         },
         x: {
            display: false,
            grid: {
               display: false,
               drawBorder: false,
            },
            ticks: {
               display: false,
               padding: 0,
            },
            border: {
               display: false,
            },
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
            datasetIdKey={CHART_DATASET_KEY_SLIM}
            className={lineClasses}
            options={options}
            data={{
               labels,
               datasets: [
                  {
                     fill: 'start',
                     showLine: false,
                     data: series,
                     pointRadius: 0,
                     borderColor: 'rgb(31, 205, 176)',
                     backgroundColor: 'rgba(31, 205, 176, 0.5)',
                  },
               ],
            }}
         />
      </div>
   );
};

export default ChartSlim;
