// Email throttling cache to prevent spam
import { readFile } from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { atomicWriteFile } from './atomicWrite';

interface EmailCache {
   [domain: string]: {
      lastSent: string;
      count: number;
   }
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'email-throttle.json');
const MIN_EMAIL_INTERVAL = 60 * 60 * 1000; // 1 hour minimum between emails
const MAX_EMAILS_PER_DAY = 5; // Maximum emails per domain per day

// Simple in-memory lock to prevent concurrent cache operations
let cacheLock: Promise<void> = Promise.resolve();

/**
 * Acquire lock for cache operations
 */
const acquireLock = (): Promise<() => void> => {
   const previousLock = cacheLock;
   let releaseLock: (() => void) | undefined;
   cacheLock = new Promise((resolve) => {
      releaseLock = resolve;
   });
   // Return the release function once the previous lock is released
   return previousLock.then(() => {
      if (!releaseLock) {
         throw new Error('Lock release function was not initialized');
      }
      return releaseLock;
   });
};

/**
 * The throttling rules, applied to one domain's cache entry. Shared by canSendEmail and reserveEmailSend.
 */
const throttleVerdict = (domainCache: EmailCache[string] | undefined, now: Date): { canSend: boolean; reason?: string } => {
   if (!domainCache) {
      return { canSend: true };
   }

   const lastSentDate = new Date(domainCache.lastSent);
   const lastSentToday = lastSentDate.toDateString();

   // Reset daily count if it's a new day
   const count = lastSentToday !== now.toDateString() ? 0 : domainCache.count;

   if (count >= MAX_EMAILS_PER_DAY) {
      return {
         canSend: false,
         reason: `Daily email limit reached (${MAX_EMAILS_PER_DAY}). Next email can be sent tomorrow.`
      };
   }

   const timeSinceLastEmail = now.getTime() - lastSentDate.getTime();
   if (timeSinceLastEmail < MIN_EMAIL_INTERVAL) {
      const waitMinutes = Math.ceil((MIN_EMAIL_INTERVAL - timeSinceLastEmail) / (60 * 1000));
      return {
         canSend: false,
         reason: `Minimum interval not met. Wait ${waitMinutes} more minutes before sending next email.`
      };
   }

   return { canSend: true };
};

/**
 * Check if email can be sent based on throttling rules
 */
export const canSendEmail = async (domain: string): Promise<{ canSend: boolean; reason?: string }> => {
   let releaseLock: (() => void) | undefined;
   try {
      releaseLock = await acquireLock();
      const cache = await getEmailCache();
      return throttleVerdict(cache[domain], new Date());
   } catch (error) {
      logger.error('Error checking email throttle cache, allowing email', error instanceof Error ? error : new Error(String(error)));
      return { canSend: true };
   } finally {
      if (releaseLock) {
         releaseLock();
      }
   }
};

/**
 * Record that an email was sent
 */
export const recordEmailSent = async (domain: string): Promise<void> => {
   let releaseLock: (() => void) | undefined;
   try {
      releaseLock = await acquireLock();
      const cache = await getEmailCache();
      const now = new Date();
      const today = now.toDateString();
      
      const domainCache = cache[domain];
      let count = 1;
      
      if (domainCache) {
         const lastSentToday = new Date(domainCache.lastSent).toDateString();
         // If same day, increment count
         if (lastSentToday === today) {
            count = domainCache.count + 1;
         }
      }
      
      cache[domain] = {
         lastSent: now.toISOString(),
         count
      };
      
      await saveEmailCache(cache);
   } catch (error) {
      logger.error('Error recording email sent', error instanceof Error ? error : new Error(String(error)));
   } finally {
      if (releaseLock) {
         releaseLock();
      }
   }
};

/**
 * Checks the rules and, when a send is allowed, records it, both under one lock. Two notification runs can
 * no longer both pass the check. If the send then fails, call release() to restore the previous entry, so a
 * failed send does not use up the day's allowance.
 */
export const reserveEmailSend = async (domain: string): Promise<{ reserved: boolean; reason?: string; release: () => Promise<void> }> => {
   const noop = async () => undefined;
   let releaseLock: (() => void) | undefined;
   try {
      releaseLock = await acquireLock();
      const cache = await getEmailCache();
      const now = new Date();
      const verdict = throttleVerdict(cache[domain], now);
      if (!verdict.canSend) {
         return { reserved: false, reason: verdict.reason, release: noop };
      }

      const previous = cache[domain];
      const sameDay = previous && new Date(previous.lastSent).toDateString() === now.toDateString();
      cache[domain] = {
         lastSent: now.toISOString(),
         count: sameDay ? previous.count + 1 : 1,
      };
      await saveEmailCache(cache);

      return {
         reserved: true,
         release: async () => {
            const unlock = await acquireLock();
            try {
               const current = await getEmailCache();
               if (previous) {
                  current[domain] = previous;
               } else {
                  delete current[domain];
               }
               await saveEmailCache(current);
            } finally {
               unlock();
            }
         },
      };
   } catch (error) {
      // Like canSendEmail, a broken cache does not block sending
      logger.error('Error reserving email send, allowing email', error instanceof Error ? error : new Error(String(error)));
      return { reserved: true, release: noop };
   } finally {
      if (releaseLock) {
         releaseLock();
      }
   }
};

/**
 * Get email cache from file
 */
const getEmailCache = async (): Promise<EmailCache> => {
   try {
      const cacheData = await readFile(CACHE_FILE, 'utf-8');
      return JSON.parse(cacheData) || {};
   } catch (error) {
      logger.error('Error loading email throttle cache, returning empty map', error instanceof Error ? error : new Error(String(error)));
      // File doesn't exist or is invalid, return empty cache
      return {};
   }
};

/**
 * Save email cache to file
 */
const saveEmailCache = async (cache: EmailCache): Promise<void> => {
   try {
      await atomicWriteFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
   } catch (error) {
      logger.error('Error saving email throttle cache', error instanceof Error ? error : new Error(String(error)));
   }
};