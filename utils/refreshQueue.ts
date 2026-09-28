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
   domains: Set<string>;
   execute: () => Promise<void>;
};

class RefreshQueue {
   private queue: RefreshTask[] = [];
   private activeProcesses = new Map<string, Promise<void>>(); // Track active processes by task ID
   private activeDomains = new Set<string>(); // Track which domains are currently being processed
   private maxConcurrency: number;

   constructor() {
      // Read concurrency from environment variable, default to 3
      const envConcurrency = process.env.REFRESH_QUEUE_CONCURRENCY;
      const parsedConcurrency = envConcurrency ? parseInt(envConcurrency, 10) : 3;
      
      // Validate and set concurrency (must be at least 1)
      this.maxConcurrency = Number.isFinite(parsedConcurrency) && parsedConcurrency >= 1 
         ? parsedConcurrency 
         : 3;
      
      if (envConcurrency && parsedConcurrency !== this.maxConcurrency) {
         logger.warn(`Invalid REFRESH_QUEUE_CONCURRENCY value "${envConcurrency}", using default: ${this.maxConcurrency}`);
      } else if (envConcurrency && this.maxConcurrency !== 3) {
         logger.info(`Refresh queue concurrency set to ${this.maxConcurrency} via environment variable`);
      }
   }

   /**
    * Add a refresh task to the queue
    * @param taskId Unique identifier for this task
    * @param domains Complete set of domain names touched by the task
    * @param task The async function to execute
    */
   async enqueue(taskId: string, task: () => Promise<void>, domains: Iterable<string> = []): Promise<void> {
      const normalizedDomains = new Set(Array.from(domains, (domain) => domain.trim().toLowerCase()).filter(Boolean));
      logger.info(`Enqueueing refresh task: ${taskId}`, { domains: Array.from(normalizedDomains) });
      
      // Check whether any task domain is already being processed
      if (Array.from(normalizedDomains).some((domain) => this.activeDomains.has(domain))) {
         logger.info('One or more task domains are already being processed, queueing task', { taskId, domains: Array.from(normalizedDomains) });
      }
      
      this.queue.push({
         id: taskId,
         domains: normalizedDomains,
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
            Array.from(task.domains).every((domain) => !this.activeDomains.has(domain))
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
      const domains = Array.from(task.domains);
      logger.info(`Starting refresh task: ${task.id}`, { domains });
      const startTime = Date.now();

      // Mark domain as active if specified
      // processQueue is synchronous, so marking the complete set here is atomic
      // with respect to selection of the next task.
      domains.forEach((domain) => this.activeDomains.add(domain));

      // Create and track the promise
      const taskPromise = task.execute()
         .then(() => {
            const duration = Date.now() - startTime;
            logger.info(`Completed refresh task: ${task.id} (${duration}ms)`, { domains });
         })
         .catch((error) => {
            const duration = Date.now() - startTime;
            logger.error(`Failed refresh task: ${task.id} (${duration}ms)`, error instanceof Error ? error : new Error(String(error)), { domains });
         })
         .finally(() => {
            // Clean up: remove from active tracking
            this.activeProcesses.delete(task.id);
            domains.forEach((domain) => this.activeDomains.delete(domain));
            
            // Try to process more tasks now that we have a free slot
            this.processQueue();
         });

      this.activeProcesses.set(task.id, taskPromise);
   }

   /**
    * Check if a domain is currently being processed or queued
    */
   isDomainLocked(domain: string): boolean {
      const normalizedDomain = domain.trim().toLowerCase();
      // A domain is considered locked if it is either actively being processed
      // or has a pending task in the queue.
      return this.activeDomains.has(normalizedDomain) || this.queue.some(task => task.domains.has(normalizedDomain));
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
