/**
 * Refresh Queue Manager
 * 
 * Ensures single-writer database access by queuing refresh operations.
 * Only one refresh operation (cron or manual) can run at a time.
 * This prevents database concurrency issues when multiple refresh requests
 * are triggered in quick succession.
 */

import { logger } from './logger';

type RefreshTask = {
   id: string;
   execute: () => Promise<void>;
};

class RefreshQueue {
   private queue: RefreshTask[] = [];
   private isProcessing: boolean = false;

   /**
    * Add a refresh task to the queue and start processing if not already running
    */
   async enqueue(taskId: string, task: () => Promise<void>): Promise<void> {
      logger.info(`Enqueueing refresh task: ${taskId}`);
      
      this.queue.push({
         id: taskId,
         execute: task,
      });

      logger.debug(`Queue length: ${this.queue.length}, Processing: ${this.isProcessing}`);

      // Start processing the queue if not already running
      if (!this.isProcessing) {
         this.processQueue();
      }
   }

   /**
    * Process queued tasks sequentially
    */
   private async processQueue(): Promise<void> {
      if (this.isProcessing) {
         logger.debug('Queue processing already in progress');
         return;
      }

      this.isProcessing = true;
      logger.info('Starting queue processing');

      while (this.queue.length > 0) {
         const task = this.queue.shift();
         if (!task) continue;

         logger.info(`Processing refresh task: ${task.id}`);
         const startTime = Date.now();

         try {
            await task.execute();
            const duration = Date.now() - startTime;
            logger.info(`Completed refresh task: ${task.id} (${duration}ms)`);
         } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Failed refresh task: ${task.id} (${duration}ms)`, error instanceof Error ? error : new Error(String(error)));
         }
      }

      this.isProcessing = false;
      logger.info('Queue processing completed');
   }

   /**
    * Get current queue status
    */
   getStatus() {
      return {
         queueLength: this.queue.length,
         isProcessing: this.isProcessing,
         pendingTaskIds: this.queue.map(t => t.id),
      };
   }
}

// Singleton instance
export const refreshQueue = new RefreshQueue();
