import { calculateChartBounds } from '../../../utils/client/chartBounds';
import { historyKeyToTime, normalizeHistoryDateKey, toHistoryDateKey } from '../../../utils/historyDateKey';
import { dateKeyInZone as timezoneDateKeyInZone, dateKeyToTime as timezoneDateKeyToTime, daysAgoKey as timezoneDaysAgoKey, formatDateKey as timezoneFormatDateKey, resolveTimezone as timezoneResolveTimezone } from '../../../utils/timezone';
import { generateTheChartData } from '../../../utils/client/generateChartData';

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

describe('chart data', () => {
  /** Build a date-key string N days before today */
  const daysAgo = (n: number): string => {
     const d = new Date();
     d.setDate(d.getDate() - n);
     return toHistoryDateKey(d);
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
});

describe('app time zone helpers', () => {
    const instant = '2026-01-06T02:30:00Z';

    it('gives the calendar day of one instant in each zone', () => {
      expect(timezoneDateKeyInZone(instant, 'America/Los_Angeles')).toBe('2026-01-05');
      expect(timezoneDateKeyInZone(instant, 'UTC')).toBe('2026-01-06');
      expect(timezoneDateKeyInZone(instant, 'Pacific/Auckland')).toBe('2026-01-06');
    });

    it('steps back across a month boundary', () => {
      const now = new Date('2026-03-02T12:00:00Z');

      expect(timezoneDaysAgoKey(3, 'UTC', now)).toBe('2026-02-27');
    });

    it('steps back across the US DST change in calendar days', () => {
      // DST starts 2026-03-08 in America/New_York, so 2026-03-09 12:00Z is 08:00 EDT.
      const now = new Date('2026-03-09T12:00:00Z');

      expect(timezoneDaysAgoKey(2, 'America/New_York', now)).toBe('2026-03-07');
    });

    it('falls back to America/New_York for invalid or empty zone names', () => {
      expect(timezoneResolveTimezone('Not/A_Zone')).toBe('America/New_York');
      expect(timezoneResolveTimezone('')).toBe('America/New_York');
      expect(timezoneResolveTimezone(undefined)).toBe('America/New_York');
    });

    it('formats a date key as a label without shifting the day', () => {
      expect(timezoneFormatDateKey('2026-01-05')).toBe('Jan 5, 2026');
    });

    it('reads padded and unpadded keys as the same day', () => {
      expect(timezoneDateKeyToTime('2026-1-5')).toBe(timezoneDateKeyToTime('2026-01-05'));
    });
  });

describe('historyDateKey', () => {
  describe('history date keys', () => {
    it('writes the zero-padded calendar date in the given time zone, whatever the machine time zone is', () => {
      // 23:59 on Jan 5 and 00:00 on Nov 12 in New York (UTC-5 in both months)
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 0, 6, 4, 59)), 'America/New_York')).toBe('2026-01-05');
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 10, 12, 5, 0)), 'America/New_York')).toBe('2026-11-12');
      expect(toHistoryDateKey(new Date(Date.UTC(2026, 10, 12, 5, 0)), 'Asia/Tokyo')).toBe('2026-11-12');
    });

    it('reads a key as UTC midnight of that calendar day', () => {
      expect(historyKeyToTime('2026-01-05')).toBe(Date.UTC(2026, 0, 5));
    });

    it('orders keys by day', () => {
      const keys = ['2026-11-02', '2026-01-31', '2026-02-01'];

      expect([...keys].sort((a, b) => historyKeyToTime(a) - historyKeyToTime(b))).toEqual(['2026-01-31', '2026-02-01', '2026-11-02']);
    });

    it('falls back to Date parsing for anything that is not a date key', () => {
      expect(historyKeyToTime('not a date')).toBeNaN();
    });
  });

  describe('normalizeHistoryDateKey', () => {
    it('pads unpadded keys and leaves other keys alone', () => {
      expect(normalizeHistoryDateKey('2026-1-5')).toBe('2026-01-05');
      expect(normalizeHistoryDateKey('2026-11-12')).toBe('2026-11-12');
      expect(normalizeHistoryDateKey('not a date')).toBe('not a date');
    });
  });
});
