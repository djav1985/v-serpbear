import { historyKeyToTime } from '../historyDateKey';
import { daysAgoKey } from '../timezone';
import { getAppTimezone } from './appTimezone';

type ChartData = {
   labels: string[],
   series: number[]
}

export const generateTheChartData = (history: KeywordHistory, time:string = '30'): ChartData => {
   const timezone = getAppTimezone();
   let lastFoundSerp = 0;
   const chartData: ChartData = { labels: [], series: [] };

   if (time === 'all') {
      Object.keys(history).forEach((dateKey) => {
         const serpVal = history[dateKey] ? history[dateKey] : 111;
         chartData.labels.push(dateKey);
         chartData.series.push(serpVal);
      });
   } else {
      const windowDays = parseInt(time, 10);

      // Seed lastFoundSerp with the most recent positive entry that predates the window.
      // Without this, a keyword that was ranked before the window but has only 0s inside it
      // produces an all-111 series which chartBounds excludes, leaving the chart blank.
      const windowCutoffTime = historyKeyToTime(daysAgoKey(windowDays - 1, timezone));
      let latestSeedTime: number | null = null;
      for (const [dateKey, value] of Object.entries(history)) {
         if (typeof value !== 'number' || value <= 0) continue;
         const entryTime = historyKeyToTime(dateKey);
         if (entryTime >= windowCutoffTime) continue;
         if (latestSeedTime === null || entryTime > latestSeedTime) {
            latestSeedTime = entryTime;
            lastFoundSerp = value;
         }
      }

      // First Generate Labels. The labels should be the last N days dates. Format: Oct 26
      for (let index = windowDays - 1; index >= 0; index -= 1) {
         const pastDateKey = daysAgoKey(index, timezone);
         // Then Generate Series. if past date's serp does not exist, use 0.
         // If have a missing serp in between dates, use the previous date's serp to fill the gap.
         const prevSerp = history[pastDateKey];
         const serpVal = (typeof prevSerp === 'number' && prevSerp > 0)
            ? prevSerp
            : (lastFoundSerp > 0 ? lastFoundSerp : 111);
         if (typeof prevSerp === 'number' && prevSerp > 0) { lastFoundSerp = prevSerp; }
         chartData.labels.push(pastDateKey);
         chartData.series.push(serpVal);
      }
   }
   // console.log(chartData);

   return chartData;
};
