import { historyKeyToTime, normalizeHistoryDateKey, toHistoryDateKey } from '../../utils/historyDateKey';
import { formatLocation, getLocationCountry, parseLocation } from '../../utils/location';
import { dateKeyInZone, dateKeyToTime, daysAgoKey, formatDateKey, resolveTimezone } from '../../utils/timezone';
import { resetRateLimits, takeRateLimitToken } from '../../utils/rateLimit';

describe('historyDateKey', () => {
describe('history date keys', () => {
  it('writes zero-padded local dates', () => {
    expect(toHistoryDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toHistoryDateKey(new Date(2026, 10, 12, 0, 0))).toBe('2026-11-12');
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

describe('location', () => {
describe('getLocationCountry', () => {
   it('returns the country of a full city, state, country location', () => {
      expect(getLocationCountry('London,England,GB')).toBe('GB');
      expect(getLocationCountry('Austin,TX,US')).toBe('US');
   });

   it('treats a bare country code as the whole location', () => {
      expect(getLocationCountry('US')).toBe('US');
   });

   it('returns an empty string for empty, null or undefined locations', () => {
      expect(getLocationCountry('')).toBe('');
      expect(getLocationCountry('   ')).toBe('');
      expect(getLocationCountry(null)).toBe('');
      expect(getLocationCountry(undefined)).toBe('');
   });

   it('returns an empty string when the location has no known country', () => {
      expect(getLocationCountry('Austin,TX')).toBe('');
      expect(getLocationCountry('Austin')).toBe('');
      expect(getLocationCountry('Austin,TX,QX')).toBe('');
   });

   it('does not treat object prototype keys as countries', () => {
      expect(getLocationCountry('constructor')).toBe('');
      expect(getLocationCountry('toString')).toBe('');
   });
});

describe('location formatting helpers', () => {
   it('formats and parses a location round trip', () => {
      const location = formatLocation({ city: 'Austin', state: 'TX', country: 'US' });
      expect(location).toBe('Austin,TX,US');
      expect(parseLocation(location)).toEqual({ city: 'Austin', state: 'TX', country: 'US' });
   });
});
});

describe('timezone', () => {
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
});

describe('rateLimit', () => {
describe('takeRateLimitToken', () => {
  beforeEach(() => resetRateLimits());

  it('allows the limit within a window, refuses the next one and starts over after the window', () => {
    expect(takeRateLimitToken('a', 2, 1000, 0)).toBe(true);
    expect(takeRateLimitToken('a', 2, 1000, 10)).toBe(true);
    expect(takeRateLimitToken('a', 2, 1000, 20)).toBe(false);
    expect(takeRateLimitToken('a', 2, 1000, 1000)).toBe(true);
  });

  it('keeps an hourly window when a key with a one minute window is used later', () => {
    const HOUR = 60 * 60 * 1000;
    expect(takeRateLimitToken('hourly', 1, HOUR, 0)).toBe(true);
    // Another key with a short window must not shorten the first key's window
    expect(takeRateLimitToken('minute', 1, 60 * 1000, 1000)).toBe(true);
    expect(takeRateLimitToken('minute', 1, 60 * 1000, 120 * 1000)).toBe(true);
    expect(takeRateLimitToken('hourly', 1, HOUR, 5 * 60 * 1000)).toBe(false);
  });
});
});
