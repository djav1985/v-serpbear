'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { RefreshCw } from 'lucide-react';
import { Card } from 'components/ui/card';
import { Switch } from 'components/ui/switch';
import { cn } from 'lib/utils';
import { formatAveragePosition, roundAveragePosition } from 'utils/averagePosition';
import { formatInZone } from 'utils/timezone';
import type { DomainCardData } from './domain-card-data';

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
   domain: DomainCardData;
   consoleIntegrated: boolean;
   thumb?: string;
   showMapPackStat: boolean;
   timezone: string;
   toggling: boolean;
   onToggle: (next: boolean) => void;
   onRefreshThumb: () => void;
};

export function DomainCard({
   domain, consoleIntegrated, thumb, showMapPackStat, timezone, toggling, onToggle, onRefreshThumb,
}: DomainCardProps) {
   const router = useRouter();
   const avgPosition = roundAveragePosition(domain.avgPosition);
   const prevAvgPosition = domain.prevAvgPosition === null ? null : roundAveragePosition(domain.prevAvgPosition);
   const href = `/domain/${domain.slug}`;

   return (
      <Card
         className="hover:ring-primary/30 cursor-pointer gap-0 p-0 transition-shadow"
         data-testid="domain-card"
         onClick={(event) => {
            // The name is a real link and the switch is a control, so only clicks elsewhere on the card navigate.
            if ((event.target as HTMLElement).closest('a, button, label, input, [role="switch"]')) { return; }
            router.push(href);
         }}
      >
         <div className="flex justify-end px-5 pt-4">
            <label className={cn('text-muted-foreground flex items-center gap-2 text-xs', toggling && 'cursor-not-allowed opacity-70')}>
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
         <div className="flex flex-col lg:flex-row">
            <div className={cn('flex flex-1 gap-4 px-5 pt-2 pb-5', !consoleIntegrated && 'lg:basis-1/3')}>
               <div className="group bg-muted relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                  <button
                     type="button"
                     className="text-muted-foreground hover:text-foreground absolute top-0 right-1 z-10 p-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                     title="Reload website screenshot"
                     aria-label={`Reload ${domain.domain} screenshot`}
                     onClick={onRefreshThumb}
                  >
                     <RefreshCw className="size-3" />
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                     className={cn(!thumb && 'max-w-[50px]')}
                     src={thumb || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain.domain)}&sz=128`}
                     alt={domain.domain}
                  />
               </div>
               <div className="min-w-0 flex-1">
                  <h3 className="mb-2 truncate text-base font-semibold" title={domain.domain}>
                     <Link href={href} className="hover:underline">{domain.domain}</Link>
                  </h3>
                  <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                     {domain.keywordsUpdated ? (
                        <span suppressHydrationWarning title={formatInZone(domain.keywordsUpdated, UPDATED_TITLE_FORMAT, timezone)}>
                           Updated {dayjs(domain.keywordsUpdated).fromNow()}
                        </span>
                     ) : (
                        <span>Not updated yet</span>
                     )}
                  </div>
               </div>
            </div>

            <div className="flex flex-1 flex-col p-4">
               <p className="text-primary mb-2 text-xs font-medium">Tracker</p>
               <div className="bg-accent/40 flex flex-1 items-center rounded-md border p-4" data-testid="dom_stats">
                  <Stat label="Keywords">
                     {domain.keywordsTracked}
                     <Trend current={domain.keywordsTracked} previous={domain.prevKeywordsTracked} />
                  </Stat>
                  <Stat label="Avg position">
                     {formatAveragePosition(avgPosition)}
                     <Trend current={avgPosition} previous={prevAvgPosition} lowerIsBetter />
                  </Stat>
                  {showMapPackStat && (
                     <Stat label="Map Pack">
                        {domain.mapPackKeywords}
                        <Trend current={domain.mapPackKeywords} previous={domain.prevMapPackKeywords} />
                     </Stat>
                  )}
               </div>
            </div>

            {consoleIntegrated && (
               <div className="flex flex-1 flex-col p-4 lg:basis-56">
                  <p className="text-primary mb-2 text-xs font-medium">Search Console (7d)</p>
                  <div className="bg-accent/40 flex flex-1 items-center rounded-md border p-4" data-testid="dom_sc_stats">
                     <Stat label="Visits">
                        <CompactMetric value={domain.scVisits} />
                        <Trend current={domain.scVisits} previous={domain.scVisitsPrev} />
                     </Stat>
                     <Stat label="Impressions">
                        <CompactMetric value={domain.scImpressions} />
                        <Trend current={domain.scImpressions} previous={domain.scImpressionsPrev} />
                     </Stat>
                     <Stat label="Avg position">
                        {domain.scPosition}
                        <Trend current={domain.scPosition} previous={domain.scPositionPrev} lowerIsBetter />
                     </Stat>
                  </div>
               </div>
            )}
         </div>
      </Card>
   );
}
