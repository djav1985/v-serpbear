/**
 * In-memory limit on failed login attempts. Each key (a username or a client address) gets a window of
 * failures; reaching the limit locks that key for LOCK_MS. A successful login clears its keys.
 * State is per process, which is enough for the single-process deployment this app uses.
 */

type AttemptKey = { key: string; maxFailures: number };

type Bucket = { failures: number; windowStart: number; lockedUntil: number };

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

const pruneExpired = (now: number) => {
   for (const [key, bucket] of buckets) {
      if (bucket.lockedUntil <= now && now - bucket.windowStart >= WINDOW_MS) {
         buckets.delete(key);
      }
   }
};

/** True when any of the keys is currently locked. */
export const isLoginLocked = (keys: AttemptKey[], now: number = Date.now()): boolean => keys.some(({ key }) => {
   const bucket = buckets.get(key);
   return !!bucket && bucket.lockedUntil > now;
});

/** Counts one failed attempt against each key, locking any key that reaches its limit. */
export const recordLoginFailure = (keys: AttemptKey[], now: number = Date.now()): void => {
   pruneExpired(now);
   keys.forEach(({ key, maxFailures }) => {
      const bucket = buckets.get(key);
      if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
         buckets.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
         return;
      }
      bucket.failures += 1;
      if (bucket.failures >= maxFailures && bucket.lockedUntil <= now) {
         bucket.lockedUntil = now + LOCK_MS;
      }
   });
};

/** Forgets the failures recorded for these keys, after a successful login. */
export const clearLoginFailures = (keys: AttemptKey[]): void => {
   keys.forEach(({ key }) => buckets.delete(key));
};

export const resetLoginThrottle = (): void => buckets.clear();

export type { AttemptKey };
