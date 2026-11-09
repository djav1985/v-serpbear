import type { ReactNode } from 'react';
import { getBranding } from 'utils/branding';
import { loadDomains } from 'utils/domainsList';
import { safeJsonParse } from 'utils/safeJsonParse';
import { logger } from 'utils/logger';
import { requireSession } from 'utils/serverSession';
import { APP_TIMEZONE } from 'utils/timezone';
import packageJson from '../../package.json';
import { PageTransition } from '../_components/page-transition';
import { DashboardFooter } from './_components/dashboard-footer';
import { ShellProvider, type DomainSummary } from './_components/shell-context';
import { TopBar } from './_components/top-bar';

/** Reads only what the domain list needs. A failed read is reported to the shell instead of looking like "no domains". */
const loadSidebarDomains = async (): Promise<{ domains: DomainSummary[]; failed: boolean }> => {
   try {
      const domains = await loadDomains();
      return {
         domains: domains.map((item) => {
            const searchConsole = safeJsonParse<DomainSearchConsole | null>(item.search_console, null, { context: `domain ${item.domain} search_console` });
            return {
               id: item.ID,
               domain: item.domain,
               slug: item.slug,
               scrapeEnabled: Boolean(item.scrapeEnabled),
               hasOwnSearchConsole: !!(searchConsole?.client_email && searchConsole?.private_key),
            };
         }),
         failed: false,
      };
   } catch (error) {
      logger.error('Loading domains for the dashboard shell', error instanceof Error ? error : new Error(String(error)));
      return { domains: [], failed: true };
   }
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
   // Signed-out visitors go to /login. Pages and API handlers still check the session themselves.
   await requireSession();

   const { domains, failed } = await loadSidebarDomains();
   const branding = getBranding();

   return (
      <ShellProvider domains={domains} domainsFailed={failed} timezone={APP_TIMEZONE} platformName={branding.platformName}>
         <div className="flex min-h-screen flex-col">
            <TopBar branding={branding} />
            {/* Only the page content cross-fades, so the top bar and footer stay still */}
            <main className="mx-auto w-full max-w-screen-2xl min-w-0 flex-1 p-4 md:p-6"><PageTransition>{children}</PageTransition></main>
            <DashboardFooter platformName={branding.platformName} version={packageJson.version} />
         </div>
      </ShellProvider>
   );
}
