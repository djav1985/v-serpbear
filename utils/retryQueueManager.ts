import { readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
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

class RetryQueueManager {
   private filePath: string;

   constructor() {
      this.filePath = `${process.cwd()}/data/failed_queue.json`;
   }

   /**
    * Serializes operations to ensure only one read-modify-write cycle happens at a time,
    * using an OS-level file lock so that multiple Node.js processes cannot interleave
    * their read-modify-write sequences.
    */
   private async withLock<T>(operation: () => Promise<T>): Promise<T> {
      let release: () => Promise<void>;

      // Ensure the queue file exists before trying to lock it
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         await readFile(this.filePath, { encoding: 'utf-8' });
      } catch (err: any) {
         if (err.code === 'ENOENT') {
            // File doesn't exist - create it with empty array
            try {
               const dir = dirname(this.filePath);
               // eslint-disable-next-line security/detect-non-literal-fs-filename
               await mkdir(dir, { recursive: true });
               await atomicWriteFile(this.filePath, JSON.stringify([]), 'utf-8');
            } catch (createErr: any) {
               logger.debug('Failed to create retry queue file', { error: createErr?.message });
               throw createErr;
            }
         } else {
            logger.debug('Failed to read retry queue file', { error: err?.message });
            throw err;
         }
      }

      try {
         // Acquire a cross-process file lock on the queue file with retry/backoff.
         release = await lockfile.lock(this.filePath, {
            retries: {
               retries: 5,
               factor: 2,
               minTimeout: 50,
               maxTimeout: 1000,
            },
         });
      } catch (err: any) {
         logger.debug('Failed to acquire retry queue file lock', { error: err?.message });
         throw err;
      }

      try {
         // Execute this operation while holding the file lock.
         return await operation();
      } finally {
         try {
            await release();
         } catch (err: any) {
            // Log but do not rethrow to avoid masking the original operation error.
            logger.debug('Failed to release retry queue file lock', { error: err?.message });
         }
      }
   }

   /**
    * Read the current retry queue from file
    */
   private async readQueue(): Promise<number[]> {
      try {
         // eslint-disable-next-line security/detect-non-literal-fs-filename
         const rawData = await readFile(this.filePath, { encoding: 'utf-8' });
         const parsed = JSON.parse(rawData);
         return Array.isArray(parsed) ? parsed.filter(id => Number.isInteger(id) && id > 0) : [];
      } catch (err: any) {
         if (err.code === 'ENOENT') {
            // File doesn't exist yet - return empty array
            return [];
         }
         logger.debug('Failed to read retry queue', { error: err.message });
         return [];
      }
   }

   /**
    * Write the retry queue to file atomically
    */
   private async writeQueue(queue: number[]): Promise<void> {
      try {
         await atomicWriteFile(this.filePath, JSON.stringify(queue), 'utf-8');
      } catch (err: any) {
         logger.error('Failed to write retry queue', err);
         throw err;
      }
   }

   /**
    * Add a keyword ID to the retry queue (concurrency-safe)
    */
   async addToQueue(keywordID: number): Promise<void> {
      if (!keywordID || !Number.isInteger(keywordID) || keywordID <= 0) {
         return;
      }

      await this.withLock(async () => {
         const queue = await this.readQueue();
         
         if (!queue.includes(keywordID)) {
            queue.push(keywordID);
            await this.writeQueue(queue);
         }
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
         const filtered = queue.filter(id => id !== Math.abs(keywordID));
         
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
         const filtered = queue.filter(id => !keywordIDs.has(id));
         
         if (filtered.length !== queue.length) {
            await this.writeQueue(filtered);
         }
      });
   }

   /**
    * Get the current retry queue (for reading only)
    */
   async getQueue(): Promise<number[]> {
      return this.withLock(async () => this.readQueue());
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
