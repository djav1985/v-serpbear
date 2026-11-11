'use client';

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download, Lightbulb, LineChart, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { Button, ButtonLabel } from 'components/ui/button';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { cn } from 'lib/utils';
import { useShell } from '../../_components/shell-context';

type DomainHeaderProps = {
   domain: { domain: string; slug: string };
   searchConsoleConnected: boolean;
   adwordsConnected: boolean;
   onOpenSettings: () => void;
   onExport?: () => void;
   onReloadAll?: () => void;
   onAddKeyword?: () => void;
   onLoadIdeas?: () => void;
   /** View-specific controls, shown before the standard actions (for example the Search Console period). */
   children?: ReactNode;
};

const TABS = [
   { label: 'Tracking', base: '/domain', icon: Search, hint: undefined },
   { label: 'Discover', base: '/domain/console', icon: LineChart, hint: 'Discover keywords you already rank for' },
   { label: 'Insight', base: '/domain/insight', icon: LineChart, hint: 'Insight for Google Search Console data' },
   { label: 'Ideas', base: '/domain/ideas', icon: Lightbulb, hint: 'Get keyword ideas for this domain from Google Ads' },
] as const;

/** The domain name, the four view tabs and the actions every domain view shares. */
export function DomainHeader({ domain, onOpenSettings, onExport, onReloadAll, onAddKeyword, onLoadIdeas, children }: DomainHeaderProps) {
   const pathname = usePathname() ?? '';
   const isInsightPage = pathname === `/domain/insight/${domain.slug}`;
   const router = useRouter();
   const { domains } = useShell();

   const prefetchTab = (href: string) => {
      if (pathname === href) { return; }
      router.prefetch(href);
   };

   const switchDomain = (slug: string) => {
      // Stay on the same view (Tracking, Discover, Insight or Ideas) when switching domains.
      router.push(pathname.replace(`/${domain.slug}`, `/${slug}`));
   };

   return (
      <div className="flex flex-col gap-4">
         <h1 className="text-xl font-bold" data-testid="domain-header">{domain.domain}</h1>

         <div className="md:hidden">
            <Select value={domain.slug} onValueChange={switchDomain}>
               <SelectTrigger className="w-full" aria-label="Select domain"><SelectValue /></SelectTrigger>
               <SelectContent>{domains.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.domain}</SelectItem>)}</SelectContent>
            </Select>
         </div>

         <div className="flex flex-wrap items-end justify-between gap-3 md:border-b">
            <nav aria-label="Domain views" className="flex w-full max-w-full overflow-x-auto border-b md:-mb-px md:w-auto md:border-b-0">
               {TABS.map(({ label, base, icon: Icon, hint }) => {
                  const href = `${base}/${domain.slug}`;
                  const active = pathname === href;
                  return (
                     <Fragment key={label}>
                        <Link
                           href={href}
                           prefetch={false}
                           onPointerEnter={() => prefetchTab(href)}
                           onFocus={() => prefetchTab(href)}
                           title={hint}
                           aria-current={active ? 'page' : undefined}
                           className={cn(
                              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm lg:px-4',
                              active ? 'border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground border-transparent',
                           )}
                        >
                           <Icon className="hidden size-4 lg:block" />
                           {label}
                        </Link>
                        {label === 'Insight' && !isInsightPage && (
                           <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Domain settings" data-testid="show_domain_settings_mobile" onClick={onOpenSettings}>
                              <Settings />
                           </Button>
                        )}
                     </Fragment>
                  );
               })}
            </nav>

            <div className="flex flex-wrap items-center gap-2 pb-1">
               {children}
               {onExport && (
                  <Button variant="ghost" size="sm" data-testid="export_csv" onClick={onExport}><Download /><span className="hidden lg:inline">Export CSV</span></Button>
               )}
               {onReloadAll && (
                  <Button variant="ghost" size="sm" data-testid="reload_all" onClick={onReloadAll}><RefreshCw /><span className="hidden lg:inline">Reload All SERPs</span></Button>
               )}
               {onLoadIdeas && (
                  <Button variant="primaryAction" size="sm" data-testid="load_ideas" onClick={onLoadIdeas}><Download /><ButtonLabel>Load Ideas</ButtonLabel></Button>
               )}
               <Button variant="ghost" size="sm" className={cn(!isInsightPage && 'hidden md:inline-flex')} data-testid="show_domain_settings" onClick={onOpenSettings}><Settings /><span className="hidden lg:inline">Domain Settings</span></Button>
               {onAddKeyword && (
                  <Button variant="primaryAction" size="sm" data-testid="add_keyword" onClick={onAddKeyword}><Plus />Add Keyword</Button>
               )}
            </div>
         </div>
      </div>
   );
}
