/**
 * Refresh Queue Manager with Parallel Domain Processing
 * 
 * Allows multiple domains to be processed in parallel while preventing:
 * 1. The same domain from being refreshed multiple times simultaneously
 * 2. Database conflicts by ensuring each domain only touches its own rows
 * 
 * Features:
 * - Configurable concurrency limit for parallel processing
 * - Per-domain locking to prevent duplicate refreshes
 * - Automatic retry of queued tasks when a slot becomes available
 */

import { logger } from './logger';

type RefreshTask = {
   id: string;
   domain?: string; // Domain being refreshed (for per-domain locking)
   execute: () => Promise<void>;
};

class RefreshQueue {
   private queue: RefreshTask[] = [];
   private activeProcesses = new Map<string, Promise<void>>(); // Track active processes by task ID
   private activeDomains = new Set<string>(); // Track which domains are currently being processed
   private maxConcurrency: number = 3; // Allow up to 3 domains to process in parallel

   /**
    * Add a refresh task to the queue
    * @param taskId Unique identifier for this task
    * @param domain Optional domain name for per-domain locking
    * @param task The async function to execute
    */
   async enqueue(taskId: string, task: () => Promise<void>, domain?: string): Promise<void> {
      logger.info(`Enqueueing refresh task: ${taskId}`, { domain });
      
      // Check if this domain is already being processed
      if (domain && this.activeDomains.has(domain)) {
         logger.info(`Domain ${domain} is already being processed, queueing task`, { taskId });
      }
      
      this.queue.push({
         id: taskId,
         domain,
         execute: task,
      });

      logger.debug(`Queue status`, { 
         queueLength: this.queue.length, 
         activeProcesses: this.activeProcesses.size,
         activeDomains: Array.from(this.activeDomains),
      });

      // Try to start processing tasks if we have capacity
      this.processQueue();
   }

   /**
    * Process queued tasks with parallel execution up to maxConcurrency limit
    */
   private processQueue(): void {
      // Continue while we have capacity and queued tasks
      while (this.activeProcesses.size < this.maxConcurrency && this.queue.length > 0) {
         // Find the next task that can be processed (not blocked by domain lock)
         const taskIndex = this.queue.findIndex(task => 
            !task.domain || !this.activeDomains.has(task.domain)
         );
         
         if (taskIndex === -1) {
            // All remaining tasks are blocked by active domain locks
            logger.debug('No available tasks (all blocked by domain locks)', {
               queueLength: this.queue.length,
               activeDomains: Array.from(this.activeDomains),
            });
            break;
         }
         
         // Remove task from queue and start processing
         const task = this.queue.splice(taskIndex, 1)[0];
         this.startTask(task);
      }
   }

   /**
    * Start processing a single task
    */
   private startTask(task: RefreshTask): void {
      logger.info(`Starting refresh task: ${task.id}`, { domain: task.domain });
      const startTime = Date.now();

      // Mark domain as active if specified
      if (task.domain) {
         this.activeDomains.add(task.domain);
      }

      // Create and track the promise
      const taskPromise = task.execute()
         .then(() => {
            const duration = Date.now() - startTime;
            logger.info(`Completed refresh task: ${task.id} (${duration}ms)`, { domain: task.domain });
         })
         .catch((error) => {
            const duration = Date.now() - startTime;
            logger.error(`Failed refresh task: ${task.id} (${duration}ms)`, error instanceof Error ? error : new Error(String(error)), { domain: task.domain });
         })
         .finally(() => {
            // Clean up: remove from active tracking
            this.activeProcesses.delete(task.id);
            if (task.domain) {
               this.activeDomains.delete(task.domain);
            }
            
            // Try to process more tasks now that we have a free slot
            this.processQueue();
         });

      this.activeProcesses.set(task.id, taskPromise);
   }

   /**
    * Check if a domain is currently being processed
    */
   isDomainLocked(domain: string): boolean {
      return this.activeDomains.has(domain);
   }

   /**
    * Get current queue status
    */
   getStatus() {
      return {
         queueLength: this.queue.length,
         activeProcesses: this.activeProcesses.size,
         activeDomains: Array.from(this.activeDomains),
         pendingTaskIds: this.queue.map(t => t.id),
         maxConcurrency: this.maxConcurrency,
      };
   }

   /**
    * Set the maximum number of concurrent tasks
    */
   setMaxConcurrency(max: number): void {
      if (max < 1) {
         throw new Error('Max concurrency must be at least 1');
      }
      this.maxConcurrency = max;
      logger.info(`Updated max concurrency to ${max}`);
      
      // Try to process more tasks if we increased the limit
      this.processQueue();
   }
}

// Singleton instance
export const refreshQueue = new RefreshQueue();
