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
 * Check if email can be sent based on throttling rules
 */
export const canSendEmail = async (domain: string): Promise<{ canSend: boolean; reason?: string }> => {
   let releaseLock: (() => void) | undefined;
   try {
      releaseLock = await acquireLock();
      const cache = await getEmailCache();
      const now = new Date();
      const today = now.toDateString();
      
      const domainCache = cache[domain];
      
      if (!domainCache) {
         return { canSend: true };
      }
      
      const lastSentDate = new Date(domainCache.lastSent);
      const lastSentToday = lastSentDate.toDateString();
      
      // Reset daily count if it's a new day
      if (lastSentToday !== today) {
         domainCache.count = 0;
      }
      
      // Check daily limit
      if (domainCache.count >= MAX_EMAILS_PER_DAY) {
         return { 
            canSend: false, 
            reason: `Daily email limit reached (${MAX_EMAILS_PER_DAY}). Next email can be sent tomorrow.`
         };
      }
      
      // Check minimum interval
      const timeSinceLastEmail = now.getTime() - lastSentDate.getTime();
      if (timeSinceLastEmail < MIN_EMAIL_INTERVAL) {
         const waitTime = MIN_EMAIL_INTERVAL - timeSinceLastEmail;
         const waitMinutes = Math.ceil(waitTime / (60 * 1000));
         return { 
            canSend: false, 
            reason: `Minimum interval not met. Wait ${waitMinutes} more minutes before sending next email.`
         };
      }
      
      return { canSend: true };
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