/**
 * In-memory limit on failed login attempts. Each key (a username or a client address) gets a window of
 * failures; reaching the limit locks that key for LOCK_MS. A successful login clears its keys.
 * State is per process, which is enough for the single-process deployment this app uses.
 */

type AttemptKey = { key: string; maxFailures: number };

type Bucket = { failures: number; windowStart: number; lockedUntil: number };

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

// Upper bound on tracked keys. Usernames and addresses come from the client, so without a bound a flood of
// distinct values would grow this map (and the prune scan below) without limit.
const MAX_BUCKETS = 5000;

const buckets = new Map<string, Bucket>();

// Makes room for one more key. Buckets whose window has passed go first, then the oldest unlocked ones;
// an active lock is only dropped when every tracked key is locked.
const evictOldest = (now: number = Date.now()) => {
   if (buckets.size < MAX_BUCKETS) { return; }
   pruneExpired(now);
   while (buckets.size >= MAX_BUCKETS) {
      let victim: string | undefined;
      for (const [key, bucket] of buckets) {
         if (bucket.lockedUntil <= now) { victim = key; break; }
      }
      if (victim === undefined) {
         victim = buckets.keys().next().value;
      }
      if (victim === undefined) { return; }
      buckets.delete(victim);
   }
};

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
         if (!bucket) { evictOldest(now); }
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
