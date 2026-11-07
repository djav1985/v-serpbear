/**
 * Fixed-window rate limit kept in memory, per key. Each key may take `limit` tokens per `windowMs`.
 * Like utils/loginThrottle.ts, state is per process, which suits the single-instance deployment.
 */

type Window = { count: number; windowStart: number };

const windows = new Map<string, Window>();

// Keys can come from the client, so drop finished windows and bound the map instead of letting it grow forever.
const MAX_WINDOWS = 5000;
const prune = (now: number, windowMs: number) => {
   for (const [key, entry] of windows) {
      if (now - entry.windowStart >= windowMs) { windows.delete(key); }
   }
   while (windows.size >= MAX_WINDOWS) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) { break; }
      windows.delete(oldest);
   }
};

/**
 * Takes one token for the key. Returns false when the key has already used its allowance in this window.
 */
export const takeRateLimitToken = (key: string, limit: number, windowMs: number, now: number = Date.now()): boolean => {
   const current = windows.get(key);
   if (!current || now - current.windowStart >= windowMs) {
      if (!current && windows.size >= MAX_WINDOWS) { prune(now, windowMs); }
      windows.set(key, { count: 1, windowStart: now });
      return true;
   }
   if (current.count >= limit) {
      return false;
   }
   current.count += 1;
   return true;
};

export const resetRateLimits = (): void => windows.clear();
