import { readFile } from 'fs/promises';
import { atomicWriteFile } from './atomicWrite';
import { logger } from './logger';

/**
 * Retry Queue Manager with concurrency-safe file operations
 * 
 * This manager ensures that the failed_queue.json file is accessed safely
 * when multiple parallel domain processes are running. It uses a simple
 * in-memory lock to serialize read-modify-write operations.
 */

class RetryQueueManager {
   private filePath: string;
   private operationQueue: Promise<void> = Promise.resolve();

   constructor() {
      this.filePath = `${process.cwd()}/data/failed_queue.json`;
   }

   /**
    * Serializes operations to ensure only one read-modify-write cycle happens at a time
    */
   private async withLock<T>(operation: () => Promise<T>): Promise<T> {
      // Chain this operation after the previous one completes
      const previousOperation = this.operationQueue;
      
      let resolver: () => void;
      this.operationQueue = new Promise<void>((resolve) => {
         resolver = resolve;
      });

      try {
         // Wait for previous operation to complete
         await previousOperation;
         
         // Execute this operation
         return await operation();
      } finally {
         // Release the lock for next operation
         resolver!();
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
