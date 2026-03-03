import { generateTheChartData } from '../../../utils/client/generateChartData';

/** Build a date-key string N days before today */
const daysAgo = (n: number): string => {
   const d = new Date();
   d.setDate(d.getDate() - n);
   return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

describe('generateTheChartData', () => {
   describe('time-windowed mode', () => {
      it('returns a series with one entry per day including today', () => {
         const { labels, series } = generateTheChartData({}, '7');
         expect(labels).toHaveLength(7); // 6 days ago … today = 7 points
         expect(series).toHaveLength(7);
      });

      it('uses the actual position when history exists within the window', () => {
         const history: Record<string, number> = { [daysAgo(2)]: 5 };
         const { series } = generateTheChartData(history, '7');
         // The entry 2 days ago should be exactly 5
         expect(series[4]).toBe(5); // index 4 of 7 = (7-1)-2=4
      });

      it('carries the last known position forward for missing dates within the window', () => {
         const history: Record<string, number> = { [daysAgo(4)]: 10 };
         const { series } = generateTheChartData(history, '7');
         // index 2 = (7-1)-4 = 2 → 10; index 3+ should also be 10 (carry-forward)
         expect(series[2]).toBe(10);
         expect(series[3]).toBe(10);
         expect(series[6]).toBe(10); // today still carries 10
      });

      it('seeds lastFoundSerp from history before the window so chart is not blank', () => {
         // Keyword was ranked 10 days ago but only 0s in the last 7 days
         const history: Record<string, number> = {
            [daysAgo(10)]: 15,
            [daysAgo(3)]: 0,
            [daysAgo(1)]: 0,
         };
         const { series } = generateTheChartData(history, '7');
         // Without the seed fix all values would be 111 (blank chart).
         // With the fix, the seed = 15 so all non-positive entries use 15.
         expect(series.some((v) => v === 111)).toBe(false);
         expect(series.every((v) => v === 15)).toBe(true);
      });

      it('uses 111 for missing dates when there is no prior history at all', () => {
         const { series } = generateTheChartData({}, '7');
         expect(series.every((v) => v === 111)).toBe(true);
      });

      it('seeds from an entry exactly one day before the window start', () => {
         // With a 7-day window the oldest included day is daysAgo(6).
         // An entry at daysAgo(7) is just outside the window and must be used as seed.
         const history: Record<string, number> = {
            [daysAgo(7)]: 25,
            [daysAgo(3)]: 0,
         };
         const { series } = generateTheChartData(history, '7');
         expect(series.every((v) => v === 25)).toBe(true);
      });

      it('prefers more recent prior-history entry over an older one as the seed', () => {
         const history: Record<string, number> = {
            [daysAgo(20)]: 50,
            [daysAgo(10)]: 20, // more recent → should win
         };
         const { series } = generateTheChartData(history, '7');
         // Seed should be 20, so the 7-day window is filled with 20
         expect(series.every((v) => v === 20)).toBe(true);
      });

   });

   describe("'all' mode", () => {
      it('includes every history key', () => {
         const history: Record<string, number> = {
            '2024-1-1': 10,
            '2024-1-2': 15,
            '2024-1-3': 0,
         };
         const { labels, series } = generateTheChartData(history, 'all');
         expect(labels).toEqual(Object.keys(history));
         expect(series[0]).toBe(10);
         expect(series[1]).toBe(15);
         expect(series[2]).toBe(111); // 0 → 111 sentinel
      });
   });
});
