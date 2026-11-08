'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, CircleHelp, Globe, LogOut, Menu, Plus, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from 'app/_components/brand';
import { Button } from 'components/ui/button';
import {
   DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { cn } from 'lib/utils';
import type { BrandingConfig } from 'utils/branding';
import { apiPost, ApiError } from 'utils/client/apiClient';
import { useShell } from './shell-context';

const DOCS_URL = 'https://github.com/djav1985/v-serpbear/wiki';

const NAV = [
   { href: '/domains', label: 'Domains', icon: Globe },
   { href: '/research', label: 'Research', icon: Search },
] as const;

/** Logo on the left, the menu on the right. On phones the menu folds into one button. */
export function TopBar({ branding }: { branding: BrandingConfig }) {
   const pathname = usePathname() ?? '';
   const router = useRouter();
   const queryClient = useQueryClient();
   const { openAddDomain, openSettings } = useShell();
   const onDomainsPage = pathname === '/domains';

   const logout = async () => {
      try {
         await apiPost('/api/auth/logout', {});
         // Drop all cached server state so nothing from the previous session survives.
         queryClient.clear();
         router.push('/login');
         router.refresh();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : 'Failed to log out. Please try again.');
      }
   };

   return (
      <header className="bg-card/90 sticky top-0 z-40 border-b shadow-sm backdrop-blur-md" data-testid="topbar">
         <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
               <Link href="/domains" className="text-primary flex items-center text-base font-bold" aria-label="Home">
                  <Brand branding={branding} markSize={32} />
               </Link>
               {!onDomainsPage && (
                  <Button asChild variant="ghost" size="icon-sm" className="bg-accent text-accent-foreground ml-1 rounded-full">
                     <Link href="/domains" aria-label="Back to domains" title="Back to domains"><ChevronLeft /></Link>
                  </Button>
               )}
            </div>

            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
               {NAV.map(({ href, label, icon: Icon }) => (
                  <Button key={href} asChild variant="ghost" size="sm" className={cn(pathname === href && 'bg-accent text-accent-foreground')}>
                     <Link href={href} aria-current={pathname === href ? 'page' : undefined}><Icon />{label}</Link>
                  </Button>
               ))}
               <Button variant="ghost" size="sm" onClick={openSettings}><Settings />Settings</Button>
               <Button asChild variant="ghost" size="sm"><a href={DOCS_URL} target="_blank" rel="noreferrer"><CircleHelp />Help</a></Button>
               <Button variant="ghost" size="sm" onClick={logout}><LogOut />Logout</Button>
            </nav>

            <div className="flex items-center gap-1 md:hidden">
               <Button variant="ghost" size="icon" aria-label="Add Domain" data-testid="add_domain" onClick={openAddDomain}><Plus /></Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="icon" aria-label="Open the menu"><Menu /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                     {NAV.map(({ href, label, icon: Icon }) => (
                        <DropdownMenuItem key={href} asChild><Link href={href}><Icon />{label}</Link></DropdownMenuItem>
                     ))}
                     <DropdownMenuItem onSelect={openSettings}><Settings />Settings</DropdownMenuItem>
                     <DropdownMenuItem asChild><a href={DOCS_URL} target="_blank" rel="noreferrer"><CircleHelp />Help</a></DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onSelect={logout}><LogOut />Logout</DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>
      </header>
   );
}
