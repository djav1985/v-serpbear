import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { calculateChartBounds } from '../../utils/client/chartBounds';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type ChartProps = {
   labels: string[];
   series: number[];
   reverse?: boolean;
   noMaxLimit?: boolean;
};

const Chart = ({ labels, series, reverse = true, noMaxLimit = false }: ChartProps) => {
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
         datasetIdKey="XXX"
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
