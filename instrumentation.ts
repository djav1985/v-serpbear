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
      const { initializeDatabase } = await import('./database/init');
      await initializeDatabase();
   }
}
