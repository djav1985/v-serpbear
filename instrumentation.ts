import type { Cron } from 'croner';

type ThumbnailStartupState = { promise: Promise<void> | null; job: Cron | null };
const globalForThumbnailStartup = globalThis as typeof globalThis & { __serpbearThumbnailStartup?: ThumbnailStartupState };
globalForThumbnailStartup.__serpbearThumbnailStartup ??= { promise: null, job: null };

const THUMBNAIL_SWEEP_SCHEDULE = '0 3 * * *';

const loadTrackedDomains = async (): Promise<Array<{ ID: number; domain: string }>> => {
   const Domain = (await import('./database/models/domain')).default;
   const domains = await Domain.findAll({ attributes: ['ID', 'domain'], raw: true });
   return domains as unknown as Array<{ ID: number; domain: string }>;
};

/**
 * Next.js instrumentation hook
 * Called both during build (next build) and when the server starts (dev/production).
 * We intentionally skip database initialization during the build phase since it's only
 * needed at runtime. The database initializes when the application actually runs.
 */

export async function register() {
   // Skip database initialization during build phase
   // NEXT_PHASE is set to 'phase-production-build' during next build
   if (process.env.NEXT_PHASE === 'phase-production-build') {
      return;
   }

   if (process.env.NEXT_RUNTIME === 'nodejs') {
      const state = globalForThumbnailStartup.__serpbearThumbnailStartup as ThumbnailStartupState;
      if (state.promise) { return state.promise; }
      state.promise = (async () => {
         const { initializeDatabase } = await import('./database/init');
         await initializeDatabase();
         const records = await loadTrackedDomains();
         const { initializeThumbnailIndex, ensureThumbnails } = await import('./utils/thumbnails');
         await initializeThumbnailIndex(records);
         // Start the first missing/stale-image pass at startup; the index still serves old images during replacement.
         await ensureThumbnails(records);
         const { Cron } = await import('croner');
         const { logger } = await import('./utils/logger');

         // Look for the white-label logo and tab icon once, so no request has to check the disk
         const { ensureBrandingAssets } = await import('./utils/brandingAssets');
         ensureBrandingAssets();

         if (!state.job) {
            state.job = new Cron(THUMBNAIL_SWEEP_SCHEDULE, async () => {
               try {
                  const domains = await loadTrackedDomains();
                  await ensureThumbnails(domains);
               } catch (error) {
                  logger.error('Could not run the daily thumbnail sweep', error instanceof Error ? error : new Error(String(error)));
               }
            });
         }
      })();
      try {
         await state.promise;
      } catch (error) {
         state.promise = null;
         throw error;
      }
   }
}
