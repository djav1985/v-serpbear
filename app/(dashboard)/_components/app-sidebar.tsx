'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CircleHelp, Globe, LogOut, Plus, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from 'app/_components/brand';
import {
   Sidebar,
   SidebarContent,
   SidebarFooter,
   SidebarGroup,
   SidebarGroupLabel,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarSeparator,
   useSidebar,
} from 'components/ui/sidebar';
import type { BrandingConfig } from 'utils/branding';
import { apiPost, ApiError } from 'utils/client/apiClient';
import { useShell } from './shell-context';

const DOCS_URL = 'https://docs.serpbear.com/';

/** A domain is "active" on any of its four views: Tracker, Ideas, Discover, Insights. */
const domainPaths = (slug: string) => [
   `/domain/${slug}`,
   `/domain/ideas/${slug}`,
   `/domain/console/${slug}`,
   `/domain/insight/${slug}`,
];

export function AppSidebar({ branding }: { branding: BrandingConfig }) {
   const pathname = usePathname();
   const router = useRouter();
   const queryClient = useQueryClient();
   const { setOpenMobile } = useSidebar();
   const { domains, domainsFailed, openAddDomain, openSettings } = useShell();

   // Ignore any query string or hash so the active domain stays highlighted.
   const currentPath = (pathname || '').split(/[?#]/)[0];
   const closeMobile = () => setOpenMobile(false);

   const logout = async () => {
      try {
         await apiPost('/api/logout', {});
         // Drop all cached server state so nothing from the previous session survives.
         queryClient.clear();
         router.push('/login');
         router.refresh();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : 'Failed to log out. Please try again.');
      }
   };

   return (
      <Sidebar>
         <SidebarHeader>
            <SidebarMenu>
               <SidebarMenuItem>
                  <SidebarMenuButton asChild size="lg" className="text-primary text-base font-semibold">
                     <Link href="/domains" onClick={closeMobile}>
                        <Brand branding={branding} markSize={28} />
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            </SidebarMenu>
         </SidebarHeader>

         <SidebarContent>
            <SidebarGroup>
               <SidebarMenu>
                  <SidebarMenuItem>
                     <SidebarMenuButton asChild isActive={currentPath === '/domains'}>
                        <Link href="/domains" onClick={closeMobile}><Globe />Domains</Link>
                     </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                     <SidebarMenuButton asChild isActive={currentPath === '/research'}>
                        <Link href="/research" onClick={closeMobile}><Search />Research</Link>
                     </SidebarMenuButton>
                  </SidebarMenuItem>
               </SidebarMenu>
            </SidebarGroup>

            <SidebarGroup className="min-h-0 flex-1">
               <SidebarGroupLabel>Your domains</SidebarGroupLabel>
               <SidebarMenu className="overflow-y-auto" data-testid="sidebar">
                  {domainsFailed && (
                     <li className="text-destructive px-2 py-1 text-xs">Could not load your domains.</li>
                  )}
                  {!domainsFailed && domains.length === 0 && (
                     <li className="text-muted-foreground px-2 py-1 text-xs">No domains yet.</li>
                  )}
                  {domains.map((d) => (
                     <SidebarMenuItem key={d.domain}>
                        <SidebarMenuButton asChild isActive={domainPaths(d.slug).includes(currentPath)} tooltip={d.domain}>
                           <Link href={`/domain/${d.slug}`} onClick={closeMobile}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                 className="size-4 shrink-0"
                                 src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d.domain)}&sz=16`}
                                 alt=""
                                 width={16}
                                 height={16}
                              />
                              <span className="truncate">{d.domain}</span>
                           </Link>
                        </SidebarMenuButton>
                     </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                     <SidebarMenuButton data-testid="add_domain" className="text-muted-foreground" onClick={() => { closeMobile(); openAddDomain(); }}>
                        <Plus />Add Domain
                     </SidebarMenuButton>
                  </SidebarMenuItem>
               </SidebarMenu>
            </SidebarGroup>
         </SidebarContent>

         <SidebarFooter>
            <SidebarSeparator className="mx-0" />
            <SidebarMenu>
               <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { closeMobile(); openSettings(); }}>
                     <Settings />Settings
                  </SidebarMenuButton>
               </SidebarMenuItem>
               <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                     <a href={DOCS_URL} target="_blank" rel="noreferrer"><CircleHelp />Help</a>
                  </SidebarMenuButton>
               </SidebarMenuItem>
               <SidebarMenuItem>
                  <SidebarMenuButton onClick={logout}>
                     <LogOut />Logout
                  </SidebarMenuButton>
               </SidebarMenuItem>
            </SidebarMenu>
         </SidebarFooter>
      </Sidebar>
   );
}
