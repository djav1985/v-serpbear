export {};

import { resetRateLimits, takeRateLimitToken } from '../../utils/rateLimit';

describe('takeRateLimitToken', () => {
  const start = 1_000_000;

  beforeEach(() => {
    resetRateLimits();
  });

  it('allows up to the limit within one window, then refuses', () => {
    const results = Array.from({ length: 4 }, () => takeRateLimitToken('k', 3, 60_000, start));

    expect(results).toEqual([true, true, true, false]);
  });

  it('allows again once the window has passed', () => {
    for (let i = 0; i < 3; i += 1) takeRateLimitToken('k', 3, 60_000, start);

    expect(takeRateLimitToken('k', 3, 60_000, start + 59_999)).toBe(false);
    expect(takeRateLimitToken('k', 3, 60_000, start + 60_000)).toBe(true);
  });

  it('keeps keys apart', () => {
    for (let i = 0; i < 3; i += 1) takeRateLimitToken('a', 3, 60_000, start);

    expect(takeRateLimitToken('b', 3, 60_000, start)).toBe(true);
  });
});
