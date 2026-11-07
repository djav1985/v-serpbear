import { resetRateLimits, takeRateLimitToken } from '../../utils/rateLimit';

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
