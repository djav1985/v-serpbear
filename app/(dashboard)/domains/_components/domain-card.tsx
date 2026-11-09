'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { RefreshCw } from 'lucide-react';
import { Card } from 'components/ui/card';
import { Skeleton } from 'components/ui/skeleton';
import { Switch } from 'components/ui/switch';
import { cn } from 'lib/utils';
import { useNearViewport } from 'hooks/use-near-viewport';
import { formatAveragePosition, roundAveragePosition } from 'utils/averagePosition';
import { formatInZone } from 'utils/timezone';
import type { DomainCardData } from './domain-card-data';
import type { DomainSummary } from '../../_components/shell-context';

dayjs.extend(relativeTime);

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' });

const formatCompactNumber = (value: number) => {
   const parts = COMPACT_NUMBER_FORMATTER.formatToParts(value);
   const unit = parts.find((part) => part.type === 'compact')?.value || '';
   const numeric = parts.filter((part) => part.type !== 'compact').map((part) => part.value).join('').trim() || '0';
   return { numeric, unit };
};

const UPDATED_TITLE_FORMAT: Intl.DateTimeFormatOptions = {
   day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
};

/** Whole credits with thousands separators; a money balance (DataForSEO) as US dollars. */
const formatCredits = (value: number, unit: 'credits' | 'usd'): string => (
   unit === 'usd'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
);

type TrendProps = { current: number; previous: number | null; lowerIsBetter?: boolean };

function Trend({ current, previous, lowerIsBetter = false }: TrendProps) {
   if (previous === null || current === previous) { return null; }
   // For position metrics 0 means unranked, so a move to or from 0 is neither an improvement nor a drop.
   if (lowerIsBetter && (current === 0 || previous === 0)) { return null; }
   const isUp = current > previous;
   const isGood = lowerIsBetter ? !isUp : isUp;
   return (
      <span className={cn('ml-1 text-xs font-normal', isGood ? 'text-emerald-600' : 'text-red-500')} aria-label={isGood ? 'improved' : 'declined'}>
         {isUp ? '▲' : '▼'}
      </span>
   );
}

type StatProps = { label: string; children: React.ReactNode };

function Stat({ label, children }: StatProps) {
   return (
      <div className="flex-1 text-center">
         <span className="text-muted-foreground mb-1 block text-xs font-normal">{label}</span>
         <span className="text-2xl font-semibold">{children}</span>
      </div>
   );
}

function StatPlaceholder({ loading }: { loading: boolean }) {
   return loading ? <Skeleton className="mx-auto h-7 w-12" /> : <span aria-label="Statistics not loaded">—</span>;
}

function CompactMetric({ value }: { value: number }) {
   const { numeric, unit } = formatCompactNumber(value);
   return (
      <span className="whitespace-nowrap">
         {numeric}
         {unit && <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>}
      </span>
   );
}

type DomainCardProps = {
   domain: DomainSummary;
   stats?: DomainCardData;
   statsLoading: boolean;
   statsError: boolean;
   consoleIntegrated: boolean;
   thumb?: string;
   showMapPackStat: boolean;
   timezone: string;
   toggling: boolean;
   onToggle: (next: boolean) => void;
   onNearViewport: (domain: string) => void;
   onRefreshThumb: () => void;
   onRetryStats: () => void;
   onPrefetchDomain: () => void;
};

export function DomainCard({
   domain, stats, statsLoading, statsError, consoleIntegrated, thumb, showMapPackStat, timezone, toggling, onToggle, onNearViewport, onRefreshThumb, onRetryStats, onPrefetchDomain,
}: DomainCardProps) {
   const router = useRouter();
   const [imageRef, imagesNear] = useNearViewport<HTMLDivElement>();
   // The favicon stays hidden for 500 ms. A screenshot that is ready by then replaces it before it is ever shown.
   const [faviconReady, setFaviconReady] = useState(false);
   useEffect(() => {
      const timer = setTimeout(() => setFaviconReady(true), 500);
      return () => clearTimeout(timer);
   }, []);
   useEffect(() => {
      if (imagesNear) { onNearViewport(domain.domain); }
   }, [imagesNear, domain.domain, onNearViewport]);
   const avgPosition = roundAveragePosition(stats?.avgPosition ?? 0);
   const prevAvgPosition = stats?.prevAvgPosition == null ? null : roundAveragePosition(stats.prevAvgPosition);
   const href = `/domain/${domain.slug}`;
   const updated = stats?.keywordsUpdated ?? domain.keywordsUpdated;

   return (
      <Card
         className={cn('hover:ring-primary/30 cursor-pointer gap-0 p-0 transition-[box-shadow,filter] duration-300 hover:shadow-md', !domain.scrapeEnabled && 'grayscale')}
         data-testid="domain-card"
         onMouseEnter={onPrefetchDomain}
         onClick={(event) => {
            // The name is a real link and the switch is a control, so only clicks elsewhere on the card navigate.
            if ((event.target as HTMLElement).closest('a, button, label, input, [role="switch"]')) { return; }
            router.push(href);
         }}
      >
         <div className="flex flex-col lg:flex-row">
            <div className={cn('flex flex-1 gap-4 p-5', !consoleIntegrated && 'lg:basis-1/3')}>
               <div ref={imageRef} className="group bg-muted relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                  <button
                     type="button"
                     className="text-muted-foreground hover:text-foreground absolute top-0 right-1 z-10 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                     title="Reload website screenshot"
                     aria-label={`Reload ${domain.domain} screenshot`}
                     onClick={onRefreshThumb}
                  >
                     <RefreshCw className="size-3" />
                  </button>
                  {imagesNear && (
                     // eslint-disable-next-line @next/next/no-img-element
                     <img
                        key={thumb ? 'screenshot' : 'favicon'}
                        className={cn(thumb ? 'size-full object-cover object-top animate-in fade-in-0 duration-500 motion-reduce:animate-none' : 'max-w-[50px]', !thumb && !faviconReady && 'invisible')}
                        src={thumb || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain.domain)}&sz=128`}
                        alt={domain.domain}
                     />
                  )}
               </div>
               <div className="min-w-0 flex-1">
                  <h3 className="mb-2 truncate text-base font-semibold" title={domain.domain}>
                     <Link href={href} prefetch={false} onFocus={onPrefetchDomain} className="hover:underline">{domain.domain}</Link>
                  </h3>
                  <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                     {updated ? (
                        <span suppressHydrationWarning title={formatInZone(updated, UPDATED_TITLE_FORMAT, timezone)}>
                           Updated {dayjs(updated).fromNow()}
                        </span>
                     ) : (
                        <span>Not updated yet</span>
                     )}
                  </div>
                  {stats?.creditsRemaining !== null && stats?.creditsRemaining !== undefined && (
                     <div className="text-muted-foreground mt-1 text-xs" data-testid="dom_credits">
                        Credits remaining: {formatCredits(stats.creditsRemaining, stats.creditsUnit)}
                     </div>
                  )}
               </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col p-4 lg:basis-0">
               <div className="mb-1 flex items-end justify-between gap-3">
                  <p className="text-primary text-xs leading-none font-medium">Tracker</p>
                  <label className={cn('text-muted-foreground flex items-center gap-2 text-xs leading-none', toggling && 'cursor-not-allowed opacity-70')}>
                     <span className="text-foreground font-medium">{domain.scrapeEnabled ? 'Active' : 'Deactive'}</span>
                     <Switch
                        size="sm"
                        checked={domain.scrapeEnabled}
                        disabled={toggling}
                        aria-label="Toggle domain active status"
                        onCheckedChange={onToggle}
                     />
                  </label>
               </div>
               <div className="bg-accent/70 border-primary/15 flex flex-1 items-center rounded-md border p-4" data-testid="dom_stats">
                  <Stat label="Keywords">
                     {stats ? <>{stats.keywordsTracked}<Trend current={stats.keywordsTracked} previous={stats.prevKeywordsTracked} /></> : statsError ? <button type="button" className="text-destructive text-xs underline" onClick={onRetryStats}>Retry</button> : <StatPlaceholder loading={statsLoading} />}
                  </Stat>
                  <Stat label="Avg position">
                     {stats ? <>{formatAveragePosition(avgPosition)}<Trend current={avgPosition} previous={prevAvgPosition} lowerIsBetter /></> : <StatPlaceholder loading={statsLoading} />}
                  </Stat>
                  {(showMapPackStat || (stats?.mapPackKeywords ?? 0) > 0) && (
                     <Stat label="Map Pack">
                        {stats ? <>{stats.mapPackKeywords}<Trend current={stats.mapPackKeywords} previous={stats.prevMapPackKeywords} /></> : <StatPlaceholder loading={statsLoading} />}
                     </Stat>
                  )}
               </div>
            </div>

            {consoleIntegrated && (
               <div className="flex min-w-0 flex-1 flex-col p-4 lg:basis-0">
                  <p className="text-primary mb-2 text-xs font-medium">Search Console (7d)</p>
                  <div className="bg-accent/70 border-primary/15 flex flex-1 items-center rounded-md border p-4" data-testid="dom_sc_stats">
                     <Stat label="Visits">
                        {stats ? <><CompactMetric value={stats.scVisits} /><Trend current={stats.scVisits} previous={stats.scVisitsPrev} /></> : <StatPlaceholder loading={statsLoading} />}
                     </Stat>
                     <Stat label="Impressions">
                        {stats ? (
                           <><CompactMetric value={stats.scImpressions} /><Trend current={stats.scImpressions} previous={stats.scImpressionsPrev} /></>
                        ) : <StatPlaceholder loading={statsLoading} />}
                     </Stat>
                     <Stat label="Avg position">
                        {stats ? <>{stats.scPosition}<Trend current={stats.scPosition} previous={stats.scPositionPrev} lowerIsBetter /></> : <StatPlaceholder loading={statsLoading} />}
                     </Stat>
                  </div>
               </div>
            )}
         </div>
      </Card>
   );
}
