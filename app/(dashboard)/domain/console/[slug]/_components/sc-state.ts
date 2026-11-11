/**
 * Collapses Search Console rows (one per date) into one row per device/country/keyword.
 * Clicks and impressions are summed; CTR is total clicks / total impressions (in percent);
 * position is weighted by impressions. Without impressions, position falls back to a plain average.
 */
export const aggregateSCKeywords = (rows: SearchAnalyticsItem[]): SearchAnalyticsItem[] => {
   const groups = new Map<string, {
      base: SearchAnalyticsItem; clicks: number; impressions: number; positionWeighted: number; positionSum: number; count: number;
   }>();

   rows.forEach((row) => {
      const key = `${row.device}-${row.country}-${row.keyword}`;
      const group = groups.get(key) || { base: row, clicks: 0, impressions: 0, positionWeighted: 0, positionSum: 0, count: 0 };
      group.clicks += row.clicks;
      group.impressions += row.impressions;
      group.positionWeighted += row.position * row.impressions;
      group.positionSum += row.position;
      group.count += 1;
      groups.set(key, group);
   });

   return [...groups.values()].map(({ base, clicks, impressions, positionWeighted, positionSum, count }) => ({
      ...base,
      clicks,
      impressions,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      position: impressions > 0 ? Math.round(positionWeighted / impressions) : Math.round(positionSum / count),
   }));
};

export const SC_PERIODS = [
   { value: 'threeDays', label: '3 Days' },
   { value: 'sevenDays', label: '7 Days' },
   { value: 'thirtyDays', label: '30 Days' },
] as const;

export const SC_SORT_CHOICES = [
   { value: 'imp_desc', label: 'Most Viewed (Default)' },
   { value: 'imp_asc', label: 'Least Viewed' },
   { value: 'visits_desc', label: 'Most Visited' },
   { value: 'visits_asc', label: 'Least Visited' },
   { value: 'pos_asc', label: 'Top Position' },
   { value: 'pos_desc', label: 'Lowest Position' },
   { value: 'ctr_desc', label: 'Highest CTR' },
   { value: 'ctr_asc', label: 'Lowest CTR' },
   { value: 'alpha_asc', label: 'Alphabetically (A-Z)' },
   { value: 'alpha_desc', label: 'Alphabetically (Z-A)' },
] as const;

export type ScSummary = { position: number; impressions: number; visits: number; ctr: number };

/** Totals for the footer. Position is weighted by impressions, CTR is total clicks over total impressions. */
export const summarizeSC = (rows: SearchAnalyticsItem[]): ScSummary => {
   if (rows.length === 0) { return { position: 0, impressions: 0, visits: 0, ctr: 0 }; }
   let impressions = 0;
   let visits = 0;
   let weighted = 0;
   let positionSum = 0;
   rows.forEach((row) => {
      const imp = row.impressions ?? 0;
      const pos = row.position ?? 0;
      impressions += imp;
      visits += row.clicks ?? 0;
      weighted += pos * imp;
      positionSum += pos;
   });
   return {
      position: Math.round(impressions > 0 ? weighted / impressions : positionSum / rows.length),
      impressions,
      visits,
      ctr: impressions > 0 ? (visits / impressions) * 100 : 0,
   };
};
