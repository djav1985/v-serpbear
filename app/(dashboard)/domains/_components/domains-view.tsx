'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ButtonLabel } from 'components/ui/button';
import { apiGet, apiPut } from 'utils/client/apiClient';
import { useShell } from '../../_components/shell-context';
import { DomainCard } from './domain-card';
import { DomainsSidebar } from './domains-sidebar';
import { toDomainCardData, type DomainCardData } from './domain-card-data';
import { fetchDomainScreenshot } from './screenshots';

const ADS_PARAMS = ['ads', 'status', 'detail'] as const;
const STATS_BATCH_SIZE = 8;
const STATS_BATCH_DELAY_MS = 40;
type StatsStatus = 'queued' | 'loading' | 'ready' | 'error';

type DomainsViewProps = {
   scraperConfigured: boolean;
   searchConsoleIntegrated: boolean;
   showMapPackStat: boolean;
   timezone: string;
};

export function DomainsView({ scraperConfigured, searchConsoleIntegrated, showMapPackStat, timezone }: DomainsViewProps) {
   const router = useRouter();
   const pathname = usePathname() ?? '/domains';
   const searchString = useSearchParams()?.toString() ?? '';
   const { domains, domainsFailed, openAddDomain, openSettings } = useShell();
   const [thumbs, setThumbs] = useState<Record<string, string>>({});
   const [statsByDomain, setStatsByDomain] = useState<Record<string, DomainCardData>>({});
   const [statsStatus, setStatsStatus] = useState<Record<string, StatsStatus>>({});
   const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
   const adsHandledRef = useRef(false);
   const requestedScreenshotsRef = useRef(new Set<string>());
   const statsRef = useRef<Record<string, DomainCardData>>({});
   const statsStatusRef = useRef<Record<string, StatsStatus>>({});
   const statsQueueRef = useRef<string[]>([]);
   const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const flushStatsRef = useRef<() => Promise<void>>(async () => {});

   const flushStats = useCallback(async () => {
      statsTimerRef.current = null;
      const batch = statsQueueRef.current.splice(0, STATS_BATCH_SIZE);
      if (batch.length === 0) { return; }
      batch.forEach((domain) => { statsStatusRef.current[domain] = 'loading'; });
      setStatsStatus((current) => ({ ...current, ...Object.fromEntries(batch.map((domain) => [domain, 'loading' as const])) }));

      try {
         const query = new URLSearchParams({ withstats: 'true', domains: batch.join(',') });
         const { domains: result } = await apiGet<{ domains: DomainType[] }>(`/api/serp/domains?${query}`);
         const mapped = result.map(toDomainCardData);
         const received = new Set(mapped.map((domain) => domain.domain));
         mapped.forEach((domain) => { statsRef.current[domain.domain] = domain; });
         batch.forEach((domain) => { statsStatusRef.current[domain] = received.has(domain) ? 'ready' : 'error'; });
         setStatsByDomain((current) => ({ ...current, ...Object.fromEntries(mapped.map((domain) => [domain.domain, domain])) }));
         setStatsStatus((current) => ({
            ...current,
            ...Object.fromEntries(batch.map((domain) => [domain, received.has(domain) ? 'ready' as const : 'error' as const])),
         }));
      } catch (_error) {
         batch.forEach((domain) => { statsStatusRef.current[domain] = 'error'; });
         setStatsStatus((current) => ({ ...current, ...Object.fromEntries(batch.map((domain) => [domain, 'error' as const])) }));
      }

      if (statsQueueRef.current.length > 0 && statsTimerRef.current === null) {
         statsTimerRef.current = setTimeout(() => { void flushStatsRef.current(); }, 0);
      }
   }, []);

   const requestStats = useCallback((domain: string) => {
      if (statsRef.current[domain] || statsStatusRef.current[domain] === 'queued' || statsStatusRef.current[domain] === 'loading') { return; }
      statsStatusRef.current[domain] = 'queued';
      statsQueueRef.current.push(domain);
      setStatsStatus((current) => ({ ...current, [domain]: 'queued' }));
      if (statsTimerRef.current === null) {
         statsTimerRef.current = setTimeout(() => { void flushStats(); }, STATS_BATCH_DELAY_MS);
      }
   }, [flushStats]);

   useEffect(() => { flushStatsRef.current = flushStats; }, [flushStats]);

   useEffect(() => () => {
      if (statsTimerRef.current !== null) { clearTimeout(statsTimerRef.current); }
   }, []);

   const toggleActive = useMutation({
      mutationFn: ({ domain, scrapeEnabled }: { domain: string; scrapeEnabled: boolean }) => (
         apiPut('/api/serp/domains', { domain, scrapeEnabled })
      ),
      onMutate: ({ domain, scrapeEnabled }) => {
         setActiveOverrides((current) => ({ ...current, [domain]: scrapeEnabled }));
         return { domain };
      },
      onSuccess: (_data, { domain, scrapeEnabled }) => {
         toast.success(`${domain} marked as ${scrapeEnabled ? 'Active' : 'Deactive'}.`);
         router.refresh();
      },
      onError: (error, _variables, context) => {
         const failedDomain = context?.domain;
         if (failedDomain) {
            setActiveOverrides((current) => {
               const next = { ...current };
               delete next[failedDomain];
               return next;
            });
         }
         toast.error(error instanceof Error && error.message ? error.message : 'Error updating domain settings');
      },
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
         router.refresh();
      } else {
         toast.error(params.get('detail') || 'Google Ads integration failed. Please try again.');
      }
      ADS_PARAMS.forEach((name) => params.delete(name));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
   }, [searchString, pathname, router]);

   // The card's single near-viewport signal starts both its image and its stats request.
   const requestScreenshot = useCallback(async (domain: string) => {
      if (requestedScreenshotsRef.current.has(domain)) { return; }
      requestedScreenshotsRef.current.add(domain);
      const thumb = await fetchDomainScreenshot(domain);
      if (thumb) { setThumbs((current) => ({ ...current, [domain]: thumb })); }
   }, []);

   const requestCardData = useCallback((domain: string) => {
      requestStats(domain);
      void requestScreenshot(domain);
   }, [requestScreenshot, requestStats]);

   const refreshThumb = async (domain: string) => {
      const thumb = await fetchDomainScreenshot(domain, true);
      if (thumb) {
         setThumbs((current) => ({ ...current, [domain]: thumb }));
         toast.success(`${domain} screenshot updated successfully!`);
      } else {
         toast.error(`Failed to fetch ${domain} screenshot!`);
      }
   };

   const totalKeywords = domains.reduce((sum, domain) => sum + (statsByDomain[domain.domain]?.keywordsTracked ?? 0), 0);
   const allStatsLoaded = domains.length > 0 && domains.every((domain) => !!statsByDomain[domain.domain]);
   const showAnyMapPack = showMapPackStat || Object.values(statsByDomain).some((domain) => domain.mapPackKeywords > 0);

   return (
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
         <DomainsSidebar />
         <div className="flex min-w-0 flex-col gap-4" data-testid="domains">
            {!scraperConfigured && (
               <div role="alert" className="bg-destructive text-destructive-foreground flex flex-wrap items-center justify-center gap-2 rounded-md p-3 text-sm">
                  A scraper has not been set up yet. Open Settings to configure it and start using the app.
                  <Button size="sm" variant="secondary" onClick={openSettings}>Open Settings</Button>
               </div>
            )}

            <div className="flex items-center justify-between">
               <h1 className="sr-only">Domains</h1>
               <p className="text-muted-foreground text-sm">
                  {domains.length} Domains
                  {allStatsLoaded && <><span className="mx-2 opacity-40">|</span><span className="animate-in fade-in-0 duration-1000 motion-reduce:animate-none">{totalKeywords} keywords</span></>}
               </p>
               <Button variant="primaryAction" data-testid="addDomainButton" onClick={openAddDomain}><Plus /><ButtonLabel>Add Domain</ButtonLabel></Button>
            </div>

            {domainsFailed && (
               <div role="alert" className="rounded-md border p-8 text-center text-sm">
                  <p className="text-destructive mb-3 font-medium">Could not load your domains.</p>
                  <Button variant="outline" size="sm" onClick={() => router.refresh()}>Try again</Button>
               </div>
            )}

            {!domainsFailed && domains.length === 0 && (
               <div className="noDomains rounded-md border p-12 text-center text-sm">No domains found. Add a domain to get started!</div>
            )}

            {domains.length > 0 && (
               <div className="flex flex-col gap-4">
                  {domains.map((domain) => (
                     <DomainCard
                        key={domain.id}
                        domain={{ ...domain, scrapeEnabled: activeOverrides[domain.domain] ?? domain.scrapeEnabled }}
                        stats={statsByDomain[domain.domain]}
                        statsLoading={statsStatus[domain.domain] === 'queued' || statsStatus[domain.domain] === 'loading'}
                        statsError={statsStatus[domain.domain] === 'error'}
                        consoleIntegrated={searchConsoleIntegrated || domain.hasOwnSearchConsole}
                        thumb={thumbs[domain.domain]}
                        showMapPackStat={showAnyMapPack}
                        timezone={timezone}
                        toggling={toggleActive.isPending && toggleActive.variables?.domain === domain.domain}
                        onToggle={(scrapeEnabled) => toggleActive.mutate({ domain: domain.domain, scrapeEnabled })}
                        onNearViewport={requestCardData}
                        onRefreshThumb={() => refreshThumb(domain.domain)}
                        onRetryStats={() => requestStats(domain.domain)}
                     />
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
