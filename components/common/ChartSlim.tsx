import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateChartBounds } from '../../utils/client/chartBounds';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

type ChartProps = {
   labels: string[];
   series: number[];
   noMaxLimit?: boolean;
   reverse?: boolean;
   fillContainer?: boolean;
};

const ChartSlim = ({ labels, series, noMaxLimit = false, reverse = true, fillContainer = false }: ChartProps) => {
   const { min, max } = calculateChartBounds(series, { reverse, noMaxLimit });
   const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      scales: {
         y: {
            display: false,
            reverse,
            min,
            max,
         },
         x: {
            display: false,
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
            datasetIdKey="XXX"
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
