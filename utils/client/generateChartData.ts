type ChartData = {
   labels: string[],
   series: number[]
}

export const generateTheChartData = (history: KeywordHistory, time:string = '30'): ChartData => {
   const currentDate = new Date(); let lastFoundSerp = 0;
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
      const windowCutoff = new Date(currentDate);
      windowCutoff.setDate(windowCutoff.getDate() - windowDays);
      let latestSeedDate: Date | null = null;
      for (const [dateKey, value] of Object.entries(history)) {
         if (typeof value !== 'number' || value <= 0) continue;
         const entryDate = new Date(dateKey);
         if (entryDate >= windowCutoff) continue;
         if (!latestSeedDate || entryDate > latestSeedDate) {
            latestSeedDate = entryDate;
            lastFoundSerp = value;
         }
      }

      // First Generate Labels. The labels should be the last 30 days dates. Format: Oct 26
      for (let index = windowDays; index >= 0; index -= 1) {
         const pastDate = new Date(new Date().setDate(currentDate.getDate() - index));
         // Then Generate Series. if past date's serp does not exist, use 0.
         // If have a missing serp in between dates, use the previous date's serp to fill the gap.
         const pastDateKey = `${pastDate.getFullYear()}-${pastDate.getMonth() + 1}-${pastDate.getDate()}`;
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
