/**
 * Database initialization module
 * Ensures database is synced once at application startup
 * rather than on every API request
 */

import db from './database';
import Keyword from './models/keyword';
import { logger } from '../utils/logger';

let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

/**
 * Clears any keyword `updating` flags left set from a previous process (e.g. container
 * restart/crash mid-scrape), otherwise the UI shows stuck loading spinners forever.
 */
async function resetStaleUpdatingFlags(): Promise<void> {
   try {
      const [affectedCount] = await Keyword.update(
         { updating: 0, updatingStartedAt: null },
         { where: { updating: 1 } },
      );
      if (affectedCount > 0) {
         logger.info('Reset stale keyword updating flags on startup', { count: affectedCount });
      }
   } catch (error) {
      logger.error('Failed to reset stale keyword updating flags on startup', error instanceof Error ? error : new Error(String(error)));
   }
}

/**
 * Initialize the database connection and sync models
 * This should be called once at application startup
 * Subsequent calls will return the same promise
 */
export async function initializeDatabase(): Promise<void> {
   if (dbInitialized) {
      return Promise.resolve();
   }

   if (dbInitPromise) {
      return dbInitPromise;
   }

   dbInitPromise = (async () => {
      try {
         logger.info('Initializing database...');
         await db.sync();
         await resetStaleUpdatingFlags();
         dbInitialized = true;
         logger.info('Database initialized successfully');
      } catch (error) {
         logger.error('Failed to initialize database', error instanceof Error ? error : new Error(String(error)));
         // Reset so we can retry
         dbInitPromise = null;
         throw error;
      }
   })();

   return dbInitPromise;
}

/**
 * Check if database has been initialized
 */
export function isDatabaseInitialized(): boolean {
   return dbInitialized;
}

/**
 * Reset initialization state (for testing)
 */
export function resetDatabaseInitialization(): void {
   dbInitialized = false;
   dbInitPromise = null;
}

/**
 * Ensure database is initialized before proceeding
 * Safe to call from any API endpoint - will initialize on first call
 * and be a no-op on subsequent calls
 * 
 * This is a fallback for cases where instrumentation hook doesn't run
 * (e.g., Docker, standalone mode, some production scenarios)
 */
export async function ensureDatabase(): Promise<void> {
   if (dbInitialized) {
      return;
   }
   
   // If initialization is in progress, wait for it
   if (dbInitPromise) {
      await dbInitPromise;
      return;
   }
   
   // Otherwise, initialize now
   await initializeDatabase();
}
