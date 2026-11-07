'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from 'components/ui/button';
import { Skeleton } from 'components/ui/skeleton';
import { apiGet, apiPut } from 'utils/client/apiClient';
import { useShell } from '../../_components/shell-context';
import { DomainCard } from './domain-card';
import { toDomainCardData, type DomainCardData } from './domain-card-data';
import { fetchDomainScreenshot } from './screenshots';

// The server seeds this exact key, so the first render needs no request.
const DOMAINS_KEY = ['domains', { withStats: true }] as const;
const SCREENSHOT_CONCURRENCY = 3;
const ADS_PARAMS = ['ads', 'status', 'detail'] as const;

type DomainsViewProps = {
   /** null when the server could not read the domains, so the browser tries again and the error stays visible if it fails. */
   initialDomains: DomainCardData[] | null;
   scraperConfigured: boolean;
   searchConsoleIntegrated: boolean;
   showMapPackStat: boolean;
   timezone: string;
};

const fetchDomainCards = async (): Promise<DomainCardData[]> => {
   const { domains } = await apiGet<{ domains: DomainType[] }>('/api/domains?withstats=true');
   return domains.map(toDomainCardData);
};

export function DomainsView({
   initialDomains, scraperConfigured, searchConsoleIntegrated, showMapPackStat, timezone,
}: DomainsViewProps) {
   const router = useRouter();
   const pathname = usePathname() ?? '/domains';
   const searchString = useSearchParams()?.toString() ?? '';
   const queryClient = useQueryClient();
   const { openAddDomain, openSettings } = useShell();
   const [thumbs, setThumbs] = useState<Record<string, string>>({});
   const adsHandledRef = useRef(false);

   const { data: domains, isPending, isError, refetch } = useQuery({
      queryKey: DOMAINS_KEY,
      queryFn: fetchDomainCards,
      initialData: initialDomains ?? undefined,
   });

   const toggleActive = useMutation({
      mutationFn: ({ domain, scrapeEnabled }: { domain: string; scrapeEnabled: boolean }) => (
         apiPut(`/api/domains?domain=${encodeURIComponent(domain)}`, { scrapeEnabled })
      ),
      onMutate: async ({ domain, scrapeEnabled }) => {
         await queryClient.cancelQueries({ queryKey: DOMAINS_KEY });
         const previous = queryClient.getQueryData<DomainCardData[]>(DOMAINS_KEY);
         queryClient.setQueryData<DomainCardData[]>(DOMAINS_KEY, (current) => (
            current?.map((d) => (d.domain === domain ? { ...d, scrapeEnabled } : d))
         ));
         return { previous };
      },
      onSuccess: (_data, { domain, scrapeEnabled }) => {
         toast.success(`${domain} marked as ${scrapeEnabled ? 'Active' : 'Deactive'}.`);
      },
      onError: (error, _variables, context) => {
         if (context?.previous) { queryClient.setQueryData(DOMAINS_KEY, context.previous); }
         toast.error(error instanceof Error && error.message ? error.message : 'Error updating domain settings');
      },
      onSettled: () => { queryClient.invalidateQueries({ queryKey: ['domains'] }); },
   });

   // Google Ads OAuth fallback: when the callback cannot reach an opener window it redirects here with
   // /domains?ads=integrated&status=...&detail=.... Show the result once, then drop only those parameters.
   useEffect(() => {
      if (adsHandledRef.current) { return; }
      const params = new URLSearchParams(searchString);
      const status = params.get('status');
      if (params.get('ads') !== 'integrated' || !status) { return; }
      adsHandledRef.current = true;

      if (status === 'success') {
         toast.success('Google Ads has been integrated successfully!');
         // Settings are read on the server, so re-run it to pick up the new integration.
         router.refresh();
      } else {
         toast.error(params.get('detail') || 'Google Ads integration failed. Please try again.');
      }
      ADS_PARAMS.forEach((name) => params.delete(name));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
   }, [searchString, pathname, router]);

   // Fetch website screenshots a few at a time. A domain without one keeps its favicon.
   useEffect(() => {
      if (!domains || domains.length === 0) { return undefined; }
      let cancelled = false;
      let next = 0;
      const worker = async () => {
         while (!cancelled && next < domains.length) {
            const { domain } = domains[next];
            next += 1;
            const thumb = await fetchDomainScreenshot(domain);
            if (thumb && !cancelled) { setThumbs((current) => ({ ...current, [domain]: thumb })); }
         }
      };
      Array.from({ length: Math.min(SCREENSHOT_CONCURRENCY, domains.length) }, worker);
      return () => { cancelled = true; };
   }, [domains]);

   const refreshThumb = async (domain: string) => {
      const thumb = await fetchDomainScreenshot(domain, true);
      if (thumb) {
         setThumbs((current) => ({ ...current, [domain]: thumb }));
         toast.success(`${domain} screenshot updated successfully!`);
      } else {
         toast.error(`Failed to fetch ${domain} screenshot!`);
      }
   };

   const totalKeywords = (domains ?? []).reduce((sum, d) => sum + d.keywordsTracked, 0);

   return (
      <div className="flex flex-col gap-4" data-testid="domains">
         {!scraperConfigured && (
            <div role="alert" className="bg-destructive text-destructive-foreground flex flex-wrap items-center justify-center gap-2 rounded-md p-3 text-sm">
               A scraper has not been set up yet. Open Settings to configure it and start using the app.
               <Button size="sm" variant="secondary" onClick={openSettings}>Open Settings</Button>
            </div>
         )}

         <div className="flex items-center justify-between">
            <h1 className="sr-only">Domains</h1>
            <p className="text-muted-foreground text-sm">
               {domains ? `${domains.length} Domains` : 'Domains'}
               {domains && <span className="mx-2 opacity-40">|</span>}
               {domains && `${totalKeywords} keywords`}
            </p>
            <Button data-testid="addDomainButton" onClick={openAddDomain}>
               <Plus />Add Domain
            </Button>
         </div>

         {isPending && !domains && (
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading domains">
               {[0, 1, 2].map((key) => <Skeleton key={key} className="h-36 w-full" />)}
            </div>
         )}

         {isError && !domains && (
            <div role="alert" className="rounded-md border p-8 text-center text-sm">
               <p className="text-destructive mb-3 font-medium">Could not load your domains.</p>
               <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
            </div>
         )}

         {domains && domains.length === 0 && (
            <div className="noDomains rounded-md border p-12 text-center text-sm">
               No domains found. Add a domain to get started!
            </div>
         )}

         {domains && domains.length > 0 && (
            <div className="flex flex-col gap-4">
               {domains.map((domain) => (
                  <DomainCard
                     key={domain.id}
                     domain={domain}
                     consoleIntegrated={searchConsoleIntegrated || domain.hasOwnSearchConsole}
                     thumb={thumbs[domain.domain]}
                     showMapPackStat={showMapPackStat}
                     timezone={timezone}
                     toggling={toggleActive.isPending && toggleActive.variables?.domain === domain.domain}
                     onToggle={(scrapeEnabled) => toggleActive.mutate({ domain: domain.domain, scrapeEnabled })}
                     onRefreshThumb={() => refreshThumb(domain.domain)}
                  />
               ))}
            </div>
         )}
      </div>
   );
}
