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
   /** Reservations handed to this task: it may run while they hold its domains, and they end when it starts */
   reservations: Reservation[];
};

/** A claim on some domains. While it is held, no queued task runs on them except the one it was handed to. */
type Reservation = {
   domains: string[];
   released: boolean;
   /** True once a task took it over; the caller's own release function then does nothing */
   handedOff: boolean;
};

/** The function a caller keeps to give up a reservation. Pass it to `enqueue` to hand the reservation to a task. */
export type ReleaseReservation = () => void;

class RefreshQueue {
   private queue: RefreshTask[] = [];
   private activeProcesses = new Map<string, Promise<void>>(); // Track active processes by task ID
   private activeDomains = new Set<string>(); // Track which domains are currently being processed
   private maxConcurrency: number;
   // Domains claimed by a request (a delete, a location edit, or a refresh about to enqueue). Queued tasks wait
   // for these until the claim is released or handed to them.
   private reservedBy = new Map<string, Reservation>();
   private reservationOf = new WeakMap<ReleaseReservation, Reservation>();

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
         logger.debug(`[SCRAPER] Refresh queue concurrency set to ${this.maxConcurrency} via environment variable`);
      }
   }

   /**
    * Add a refresh task to the queue
    * @param taskId Unique identifier for this task
    * @param domains Complete set of domain names touched by the task
    * @param task The async function to execute
    */
   async enqueue(
      taskId: string,
      task: () => Promise<void>,
      domains: Iterable<string> = [],
      options: { reservations?: ReleaseReservation[] } = {},
   ): Promise<void> {
      const normalizedDomains = new Set(Array.from(domains, (domain) => domain.trim().toLowerCase()).filter(Boolean));
      logger.debug(`[SCRAPER] Enqueueing refresh task: ${taskId}`, { domains: Array.from(normalizedDomains) });
      
      // Check whether any task domain is already being processed
      if (Array.from(normalizedDomains).some((domain) => this.activeDomains.has(domain))) {
         logger.debug('[SCRAPER] One or more task domains are already being processed, queueing task', { taskId, domains: Array.from(normalizedDomains) });
      }
      
      // Taking over a reservation keeps the domains held from now until this task starts, with no gap between
      const reservations: Reservation[] = [];
      (options.reservations ?? []).forEach((release) => {
         const reservation = this.reservationOf.get(release);
         if (reservation && !reservation.released) {
            reservation.handedOff = true;
            reservations.push(reservation);
         }
      });

      this.queue.push({
         id: taskId,
         domains: normalizedDomains,
         execute: task,
         reservations,
      });

      logger.debug(`[SCRAPER] Queue status`, {
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
         const taskIndex = this.queue.findIndex((task) => this.canStart(task));
         
         if (taskIndex === -1) {
            // All remaining tasks are blocked by active domain locks
            logger.debug('[SCRAPER] No available tasks (all blocked by domain locks)', {
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

   /** A task can start when none of its domains is active, and any reservation on them is its own. */
   private canStart(task: RefreshTask): boolean {
      return Array.from(task.domains).every((domain) => {
         if (this.activeDomains.has(domain)) { return false; }
         const holder = this.reservedBy.get(domain);
         return !holder || task.reservations.includes(holder);
      });
   }

   private releaseReservation(reservation: Reservation): void {
      if (reservation.released) { return; }
      reservation.released = true;
      reservation.domains.forEach((domain) => {
         if (this.reservedBy.get(domain) === reservation) { this.reservedBy.delete(domain); }
      });
   }

   /**
    * Start processing a single task
    */
   private startTask(task: RefreshTask): void {
      const domains = Array.from(task.domains);
      logger.debug(`[SCRAPER] Starting refresh task: ${task.id}`, { domains });
      const startTime = Date.now();

      // Mark domain as active if specified
      // processQueue is synchronous, so marking the complete set here is atomic
      // with respect to selection of the next task.
      domains.forEach((domain) => this.activeDomains.add(domain));
      // The task now holds its domains as active, so the reservation handed to it has done its job
      task.reservations.forEach((reservation) => this.releaseReservation(reservation));

      // Create and track the promise
      const taskPromise = task.execute()
         .then(() => {
            const duration = Date.now() - startTime;
            logger.debug(`[SCRAPER] Completed refresh task: ${task.id} (${duration}ms)`, { domains });
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
      // A domain is considered locked if it is actively being processed, has a pending task in the queue,
      // or has been reserved by a request that is about to enqueue a task.
      return this.activeDomains.has(normalizedDomain)
         || this.reservedBy.has(normalizedDomain)
         || this.queue.some(task => task.domains.has(normalizedDomain));
   }

   /**
    * Atomically checks that none of the domains is locked and claims them.
    * The check and the claim happen in the same tick, so two requests can never both pass it.
    * While the claim is held, tasks queued for those domains wait (a delete or a location edit must not run
    * next to a refresh). Returns a release function, or null when at least one domain is already locked.
    * Call it when the request is done or abandoned. A request that queues its own refresh passes the function
    * to `enqueue` instead: the task takes the claim over, so nothing can slip in between, and the claim ends
    * when the task starts. After a hand-off the function does nothing.
    */
   reserveDomains(domains: Iterable<string>): ReleaseReservation | null {
      const normalizedDomains = Array.from(domains, (domain) => domain.trim().toLowerCase()).filter(Boolean);
      if (normalizedDomains.some((domain) => this.isDomainLocked(domain))) {
         return null;
      }

      const reservation: Reservation = { domains: normalizedDomains, released: false, handedOff: false };
      normalizedDomains.forEach((domain) => this.reservedBy.set(domain, reservation));
      const release: ReleaseReservation = () => {
         if (reservation.released || reservation.handedOff) { return; }
         this.releaseReservation(reservation);
         // Tasks that waited for this claim can start now
         this.processQueue();
      };
      this.reservationOf.set(release, reservation);
      return release;
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
      logger.debug(`[SCRAPER] Updated max concurrency to ${max}`);
      
      // Try to process more tasks if we increased the limit
      this.processQueue();
   }
}

// Singleton instance
export const refreshQueue = new RefreshQueue();
