/**
 * Next.js instrumentation hook
 * Called when the server starts (for both dev and production)
 * Perfect place to initialize database once at startup
 */

export async function register() {
   if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { initializeDatabase } = await import('./database/init');
      await initializeDatabase();
   }
}
