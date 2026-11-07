type PositionPoint = {
   position?: number | null,
   impressions?: number | null,
};

export type SearchConsolePositionTotals = {
   impressions: number,
   weightedPosition: number,
   positionTotal: number,
   count: number,
};

export const averageSearchConsolePositionFromTotals = ({ impressions, weightedPosition, positionTotal, count }: SearchConsolePositionTotals): number => (
   count <= 0
      ? 0
      : Math.round(impressions > 0 ? weightedPosition / impressions : positionTotal / count)
);

/** Returns the Search Console impression-weighted average position, rounded like the UI summaries. */
export const averageSearchConsolePosition = (points: PositionPoint[]): number => {
   const totals: SearchConsolePositionTotals = { impressions: 0, weightedPosition: 0, positionTotal: 0, count: 0 };

   points.forEach(({ position, impressions }) => {
      const safePosition = Number.isFinite(position) ? Number(position) : 0;
      const safeImpressions = Number.isFinite(impressions) ? Math.max(0, Number(impressions)) : 0;
      totals.impressions += safeImpressions;
      totals.weightedPosition += safePosition * safeImpressions;
      totals.positionTotal += safePosition;
      totals.count += 1;
   });

   return averageSearchConsolePositionFromTotals(totals);
};
