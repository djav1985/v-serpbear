import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { SidebarInset, SidebarProvider } from 'components/ui/sidebar';
import { getBranding } from 'utils/branding';
import { loadDomains } from 'utils/domainsList';
import { logger } from 'utils/logger';
import { requireSession } from 'utils/serverSession';
import packageJson from '../../package.json';
import { AppSidebar } from './_components/app-sidebar';
import { DashboardFooter } from './_components/dashboard-footer';
import { DashboardHeader } from './_components/dashboard-header';
import { ShellProvider, type DomainSummary } from './_components/shell-context';

/** Reads only what the sidebar needs. A failed read is reported to the shell instead of looking like "no domains". */
const loadSidebarDomains = async (): Promise<{ domains: DomainSummary[]; failed: boolean }> => {
   try {
      const domains = await loadDomains();
      return { domains: domains.map(({ domain, slug }) => ({ domain, slug })), failed: false };
   } catch (error) {
      logger.error('Loading domains for the dashboard shell', error instanceof Error ? error : new Error(String(error)));
      return { domains: [], failed: true };
   }
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
   // Signed-out visitors go to /login. Pages and API handlers still check the session themselves.
   await requireSession();

   const [{ domains, failed }, cookieStore] = await Promise.all([loadSidebarDomains(), cookies()]);
   const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
   const branding = getBranding();

   return (
      <ShellProvider domains={domains} domainsFailed={failed}>
         <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar branding={branding} />
            <SidebarInset className="min-w-0">
               <DashboardHeader />
               <div className="min-h-0 min-w-0 flex-1 p-4 md:p-6">{children}</div>
               <DashboardFooter platformName={branding.platformName} version={packageJson.version} />
            </SidebarInset>
         </SidebarProvider>
      </ShellProvider>
   );
}
