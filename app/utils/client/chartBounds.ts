type ChartBoundsOptions = {
   reverse?: boolean;
   noMaxLimit?: boolean;
};

const isValidPoint = (value: unknown): value is number => typeof value === 'number'
      && Number.isFinite(value)
      && value !== 0
      && value !== 111;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const calculateChartBounds = (series: number[], options: ChartBoundsOptions = {}) => {
   const { reverse = true, noMaxLimit = false } = options;
   const validValues = series.filter(isValidPoint);

   if (validValues.length === 0) {
      return {
         min: reverse ? 1 : 0,
         max: !noMaxLimit && reverse ? 100 : undefined,
      };
   }

   const minValue = Math.min(...validValues);
   const maxValue = Math.max(...validValues);
   const range = Math.max(maxValue - minValue, 1);
   const padding = Math.max(1, Math.round(range * 0.1));

   const minFloor = reverse ? 1 : 0;
   const maxCeil = reverse && !noMaxLimit ? 100 : Number.POSITIVE_INFINITY;

   let min = clamp(minValue - padding, minFloor, maxCeil);
   let max = clamp(maxValue + padding, minFloor, maxCeil);

   if (min >= max) {
      min = clamp(minValue - 1, minFloor, maxCeil);
      max = clamp(maxValue + 1, minFloor, maxCeil);
      if (min >= max) {
         max = clamp(min + 1, minFloor, maxCeil);
      }
   }

   return {
      min,
      max: noMaxLimit ? max : (reverse ? clamp(max, minFloor, 100) : max),
   };
};

export default calculateChartBounds;
