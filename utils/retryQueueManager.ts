import { rename, readFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { atomicWriteFile } from './atomicWrite';
import * as lockfile from 'proper-lockfile';
import { logger } from './logger';

/**
 * Retry Queue Manager with concurrency-safe file operations
 * 
 * This manager ensures that the failed_queue.json file is accessed safely
 * when multiple parallel domain processes are running. It uses a file-based
 * lock to serialize read-modify-write operations across processes.
 */

/**
 * One queued keyword. `attempts` counts how many times the keyword has been re-queued after a failed scrape.
 * The file stores a bare keyword ID for entries with no attempts, so older queue files still load unchanged.
 */
export type RetryQueueEntry = { id: number; attempts: number };

const isValidId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

/** Reads one stored element: a bare ID (attempts 0) or { id, attempts } (a missing attempts value means 0). */
const parseEntry = (raw: unknown): RetryQueueEntry | null => {
   if (isValidId(raw)) {
      return { id: raw, attempts: 0 };
   }
   if (raw && typeof raw === 'object') {
      const { id, attempts } = raw as { id?: unknown; attempts?: unknown };
      if (isValidId(id)) {
         const count = Number.isInteger(attempts) && (attempts as number) >= 0 ? (attempts as number) : 0;
         return { id, attempts: count };
      }
   }
   return null;
};

class RetryQueueManager {
   private filePath: string;

   constructor() {
      this.filePath = join(process.cwd(), 'data', 'failed_queue.json');
   }

   /**
    * Serializes operations to ensure only one read-modify-write cycle happens at a time,
    * using an OS-level file lock so that multiple Node.js processes cannot interleave
    * their read-modify-write sequences.
    */
   private async withLock<T>(operation: () => Promise<T>): Promise<T> {
      let release: () => Promise<void>;

      // Make sure the data directory exists; the lock itself is taken before the queue file is created, so two
      // parallel first refreshes cannot both create the file and overwrite each other's entries.
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await mkdir(dirname(this.filePath), { recursive: true });
      } catch (err: any) {
         logger.debug('[LOCK] Failed to create retry queue directory', { error: err?.message });
         throw err;
      }

      try {
         // Acquire a cross-process file lock on the queue file with retry/backoff.
         release = await lockfile.lock(this.filePath, {
            // The queue file may not exist yet, so do not resolve its real path
            realpath: false,
            // Parallel refreshes can hold this lock for a while; retry for roughly 10 seconds in total
            // before giving up, so a busy queue does not drop retry entries.
            retries: {
               retries: 12,
               factor: 1.5,
               minTimeout: 50,
               maxTimeout: 1500,
            },
         });
      } catch (err: any) {
         logger.debug('[LOCK] Failed to acquire retry queue file lock', { error: err?.message });
         throw err;
      }

      try {
         // Create the queue file (empty) while holding the lock when it does not exist yet
         try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            await readFile(this.filePath, { encoding: 'utf-8' });
         } catch (err: any) {
            if (err.code !== 'ENOENT') {
               logger.debug('[LOCK] Failed to read retry queue file', { error: err?.message });
               throw err;
            }
            try {
               await atomicWriteFile(this.filePath, JSON.stringify([]), 'utf-8');
            } catch (createErr: any) {
               logger.debug('[LOCK] Failed to create retry queue file', { error: createErr?.message });
               throw createErr;
            }
         }
         // Execute this operation while holding the file lock.
         return await operation();
      } finally {
         try {
            await release();
         } catch (err: any) {
            // Log but do not rethrow to avoid masking the original operation error.
            logger.debug('[LOCK] Failed to release retry queue file lock', { error: err?.message });
         }
      }
   }

   /**
    * Read the current retry queue from file
    */
   private async readQueue(): Promise<RetryQueueEntry[]> {
      let rawData: string;
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         rawData = await readFile(this.filePath, { encoding: 'utf-8' });
      } catch (err: any) {
         if (err.code === 'ENOENT') {
            // File doesn't exist yet - return empty array
            return [];
         }
         logger.error('Failed to read retry queue', err instanceof Error ? err : new Error(String(err)));
         throw err;
      }

      let parsed: unknown;
      try {
         parsed = JSON.parse(rawData);
      } catch (err: any) {
         // Move the damaged file aside once (kept for inspection) and carry on with an empty queue. Because the
         // file is moved, later reads see a missing file instead of re-copying it on every request, and queue
         // writes keep working instead of failing until someone repairs the file by hand.
         const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await rename(this.filePath, backupPath).catch(() => undefined);
         logger.error('Retry queue file is corrupt; it was moved aside and the queue was reset', err instanceof Error ? err : new Error(String(err)), { backupPath });
         return [];
      }
      if (!Array.isArray(parsed)) {
         return [];
      }
      // Keep one entry per keyword; if a file somehow lists a keyword twice, keep the higher attempt count
      const byId = new Map<number, RetryQueueEntry>();
      for (const raw of parsed) {
         const entry = parseEntry(raw);
         if (entry) {
            const existing = byId.get(entry.id);
            if (!existing || entry.attempts > existing.attempts) {
               byId.set(entry.id, entry);
            }
         }
      }
      return Array.from(byId.values());
   }

   /**
    * Write the retry queue to file atomically. Entries with no attempts are written as bare IDs, so the file keeps
    * the original shape for them.
    */
   private async writeQueue(queue: RetryQueueEntry[]): Promise<void> {
      const serialized = queue.map((entry) => (entry.attempts > 0 ? { id: entry.id, attempts: entry.attempts } : entry.id));
      try {
         await atomicWriteFile(this.filePath, JSON.stringify(serialized), 'utf-8');
      } catch (err: any) {
         logger.error('Failed to write retry queue', err);
         throw err;
      }
   }

   /**
    * Add a keyword to the retry queue (concurrency-safe). A keyword that is already queued is re-queued,
    * so its attempts count goes up by one; a new keyword starts at one attempt.
    */
   async addToQueue(keywordID: number): Promise<void> {
      if (!keywordID || !Number.isInteger(keywordID) || keywordID <= 0) {
         return;
      }

      await this.withLock(async () => {
         const queue = await this.readQueue();
         const existing = queue.find((entry) => entry.id === keywordID);
         if (existing) {
            existing.attempts += 1;
         } else {
            queue.push({ id: keywordID, attempts: 1 });
         }
         await this.writeQueue(queue);
      });
   }

   /**
    * Remove a keyword ID from the retry queue (concurrency-safe)
    */
   async removeFromQueue(keywordID: number): Promise<void> {
      if (!keywordID || !Number.isInteger(keywordID)) {
         return;
      }

      await this.withLock(async () => {
         const queue = await this.readQueue();
         const filtered = queue.filter(entry => entry.id !== Math.abs(keywordID));

         if (filtered.length !== queue.length) {
            await this.writeQueue(filtered);
         }
      });
   }

   /**
    * Remove multiple keyword IDs from the retry queue in a single operation (concurrency-safe)
    */
   async removeBatch(keywordIDs: Set<number>): Promise<void> {
      if (keywordIDs.size === 0) {
         return;
      }

      await this.withLock(async () => {
         const queue = await this.readQueue();
         const filtered = queue.filter(entry => !keywordIDs.has(entry.id));

         if (filtered.length !== queue.length) {
            await this.writeQueue(filtered);
         }
      });
   }

   /**
    * Read the queue entries without taking the file lock. Writes go through atomicWriteFile (write to a temp file,
    * then rename), so a read always sees either the old or the new complete file. Use this on hot read
    * paths such as loading settings, where taking the lock would make every request queue behind refreshes.
    */
   async peekEntries(): Promise<RetryQueueEntry[]> {
      try {
         return await this.readQueue();
      } catch (_error) {
         // Already logged by readQueue; a read-only peek must never break the request that asked for it
         return [];
      }
   }

   /**
    * Keyword IDs in the retry queue, without taking the lock (see peekEntries)
    */
   async peekQueue(): Promise<number[]> {
      return (await this.peekEntries()).map((entry) => entry.id);
   }

   /**
    * How many times a keyword has already been re-queued (0 when it is not queued)
    */
   async getAttempts(keywordID: number): Promise<number> {
      const entry = (await this.peekEntries()).find((item) => item.id === keywordID);
      return entry ? entry.attempts : 0;
   }

   /**
    * Clear the entire retry queue (concurrency-safe)
    */
   async clearQueue(): Promise<void> {
      await this.withLock(async () => {
         await this.writeQueue([]);
      });
   }
}

// Export singleton instance
export const retryQueueManager = new RetryQueueManager();
