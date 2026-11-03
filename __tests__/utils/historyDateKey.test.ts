export {};

import { historyKeyToTime, toHistoryDateKey } from '../../utils/historyDateKey';

describe('history date keys', () => {
  it('writes zero-padded local dates', () => {
    expect(toHistoryDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toHistoryDateKey(new Date(2026, 10, 12, 0, 0))).toBe('2026-11-12');
  });

  it('reads a key as local midnight of that calendar day', () => {
    expect(historyKeyToTime('2026-01-05')).toBe(new Date(2026, 0, 5).getTime());
  });

  it('orders keys by day', () => {
    const keys = ['2026-11-02', '2026-01-31', '2026-02-01'];

    expect([...keys].sort((a, b) => historyKeyToTime(a) - historyKeyToTime(b))).toEqual(['2026-01-31', '2026-02-01', '2026-11-02']);
  });

  it('falls back to Date parsing for anything that is not a date key', () => {
    expect(historyKeyToTime('not a date')).toBeNaN();
  });
});
