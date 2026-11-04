export {};

import { dateKeyInZone, dateKeyToTime, daysAgoKey, formatDateKey, resolveTimezone } from '../../utils/timezone';

describe('app time zone helpers', () => {
  const instant = '2026-01-06T02:30:00Z';

  it('gives the calendar day of one instant in each zone', () => {
    expect(dateKeyInZone(instant, 'America/Los_Angeles')).toBe('2026-01-05');
    expect(dateKeyInZone(instant, 'UTC')).toBe('2026-01-06');
    expect(dateKeyInZone(instant, 'Pacific/Auckland')).toBe('2026-01-06');
  });

  it('steps back across a month boundary', () => {
    const now = new Date('2026-03-02T12:00:00Z');

    expect(daysAgoKey(3, 'UTC', now)).toBe('2026-02-27');
  });

  it('steps back across the US DST change in calendar days', () => {
    // DST starts 2026-03-08 in America/New_York, so 2026-03-09 12:00Z is 08:00 EDT.
    const now = new Date('2026-03-09T12:00:00Z');

    expect(daysAgoKey(2, 'America/New_York', now)).toBe('2026-03-07');
  });

  it('falls back to America/New_York for invalid or empty zone names', () => {
    expect(resolveTimezone('Not/A_Zone')).toBe('America/New_York');
    expect(resolveTimezone('')).toBe('America/New_York');
    expect(resolveTimezone(undefined)).toBe('America/New_York');
  });

  it('formats a date key as a label without shifting the day', () => {
    expect(formatDateKey('2026-01-05')).toBe('Jan 5, 2026');
  });

  it('reads padded and unpadded keys as the same day', () => {
    expect(dateKeyToTime('2026-1-5')).toBe(dateKeyToTime('2026-01-05'));
  });
});
