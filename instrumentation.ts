/**
 * Next.js instrumentation hook
 * Called when the server starts (for both dev and production)
 * Perfect place to initialize database once at startup
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
