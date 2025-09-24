import { calculateChartBounds } from '../../../app/utils/client/chartBounds';

describe('calculateChartBounds', () => {
   it('returns default bounds when no valid points are provided', () => {
      expect(calculateChartBounds([0, 111, NaN])).toEqual({ min: 1, max: 100 });
   });

   it('applies padding around the min and max values for rank charts', () => {
      const bounds = calculateChartBounds([10, 20, 30]);
      expect(bounds).toEqual({ min: 8, max: 32 });
   });

   it('ensures min and max differ when all values are identical', () => {
      const bounds = calculateChartBounds([5, 5, 5]);
      expect(bounds.min).toBeLessThan(bounds.max as number);
      expect(bounds).toEqual({ min: 4, max: 6 });
   });

   it('supports forward charts without enforcing a 100 ceiling', () => {
      const bounds = calculateChartBounds([50, 75, 90], { reverse: false, noMaxLimit: true });
      expect(bounds).toEqual({ min: 46, max: 94 });
   });
});
