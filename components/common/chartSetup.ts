import {
   Chart as ChartJS,
   CategoryScale,
   LinearScale,
   PointElement,
   LineElement,
   Title,
   Tooltip,
   Legend,
   type ChartComponentLike,
} from 'chart.js';

/**
 * Shared Chart.js setup for the line charts in Chart and ChartSlim.
 * Registers the core components once and exposes the common options and styling.
 */

/** Registers the core line-chart components plus any extras a chart needs (e.g. Filler). */
export const registerLineChart = (...extra: ChartComponentLike[]) => {
   ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ...extra);
};

/** Options shared by every line chart in the app. */
export const BASE_CHART_OPTIONS = {
   responsive: true,
   maintainAspectRatio: false,
   animation: false as const,
};

/** Y-axis options that depend on the series bounds and direction. */
export const getYAxisBounds = (reverse: boolean, min: number | undefined, max: number | undefined) => ({
   reverse,
   min,
   max,
});

/** Shared dataset key so react-chartjs-2 does not re-create datasets on every render. */
export const CHART_DATASET_ID_KEY = 'XXX';

/** Teal fill used for the sparkline/line series. */
export const LINE_DATASET_COLORS = {
   borderColor: 'rgb(31, 205, 176)',
   backgroundColor: 'rgba(31, 205, 176, 0.5)',
};

/** Axis and grid settings that hide an axis entirely (used by the slim sparkline). */
export const HIDDEN_AXIS_OPTIONS = {
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
};
