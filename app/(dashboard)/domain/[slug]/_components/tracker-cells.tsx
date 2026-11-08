'use client';

import { useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { CircleAlert, Ellipsis, Loader2, RefreshCw, Star, Tags, Trash2 } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
   DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from 'components/ui/popover';
import { cn } from 'lib/utils';
import { getAppTimezone } from 'utils/client/appTimezone';
import { generateTheChartData } from 'utils/client/generateChartData';
import { safeHttpUrl } from 'utils/client/safeUrl';
import countries from 'utils/countries';
import { historyKeyToTime } from 'utils/historyDateKey';
import { parseLocation } from 'utils/location';
import { formatDateKey, formatInZone } from 'utils/timezone';

dayjs.extend(relativeTime);

const UPDATED_TITLE_FORMAT: Intl.DateTimeFormatOptions = {
   day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
};

// Tooltip timestamps are shown in the app time zone, not the browser's.
export const formatUpdatedTitle = (date?: string | number | Date | null): string => (
   date ? formatInZone(date, UPDATED_TITLE_FORMAT, getAppTimezone()) : ''
);

type Position = { position: number; date: string };

/** How many places a keyword moved since the previous reading. Positive is better. Same rule as the legacy table. */
export const getPositionChange = (history: KeywordHistory, position: number): number => {
   const keys = Object.keys(history);
   if (keys.length < 2) { return 0; }
   const sorted = keys
      .map((dateKey) => ({ time: historyKeyToTime(dateKey), position: history[dateKey] }))
      .sort((a, b) => a.time - b.time);
   const previous = sorted[sorted.length - 2].position;
   if (position === 0 && previous > 0) { return previous - 100; }
   return previous === 0 ? position : previous - position;
};

/** The best (lowest) ranked reading in the history, or null when it never ranked. */
export const getBestPosition = (history: KeywordHistory): Position | null => {
   const ranked = Object.keys(history)
      .map((date) => ({ date, position: history[date] }))
      .filter((entry) => entry.position > 0)
      .sort((a, b) => a.position - b.position);
   return ranked[0] ?? null;
};

// ── Keyword ────────────────────────────────────────────────────────────────

type KeywordCellProps = {
   keyword: KeywordType;
   allowsCity: boolean;
   onOpenDetails: (keyword: KeywordType) => void;
   onUnfavorite: (keyword: KeywordType) => void;
};

export function KeywordCell({ keyword, allowsCity, onOpenDetails, onUnfavorite }: KeywordCellProps) {
   const { country, location, mapPackTop3 = false, sticky = false, lastUpdateError = false } = keyword;
   const displayLocation = useMemo(() => {
      if (!allowsCity) { return ''; }
      const { city = '', state = '' } = parseLocation(location, country);
      return [city, state].filter((part) => part && part.trim() !== '').join(', ');
   }, [allowsCity, location, country]);

   return (
      <div className="flex min-w-0 items-center gap-2">
         <span className="fflag-stack shrink-0">
            <span className={`fflag fflag-${country} h-[12px] w-[18px]`} title={countries[country]?.[0] ?? country} />
            {mapPackTop3 && <span className="fflag fflag-map-pack h-[12px] w-[18px]" role="img" aria-label="Map pack top three" />}
         </span>
         <button
            type="button"
            className="hover:text-primary min-w-0 flex-1 text-left"
            title={keyword.keyword}
            onClick={() => onOpenDetails(keyword)}
         >
            <span className="block truncate font-medium">{keyword.keyword}</span>
            {displayLocation && <span className="text-muted-foreground block truncate text-xs">({displayLocation})</span>}
         </button>
         {sticky && (
            <button
               type="button"
               title="Unfavorite keyword"
               aria-label="Unfavorite keyword"
               onClick={() => onUnfavorite(keyword)}
            >
               <Star className="size-4 fill-yellow-400 text-yellow-400" />
            </button>
         )}
         {lastUpdateError && lastUpdateError.date && (
            <Popover>
               <PopoverTrigger asChild>
                  <button type="button" aria-label="Show the error from the last update" onClick={(event) => event.stopPropagation()}>
                     <CircleAlert className="text-destructive size-4" />
                  </button>
               </PopoverTrigger>
               <PopoverContent className="w-64 text-xs">
                  <p>
                     Error updating keyword position (tried{' '}
                     <span title={formatUpdatedTitle(lastUpdateError.date)}>{dayjs(lastUpdateError.date).fromNow()}</span>)
                  </p>
                  <p className="mt-2 border-t pt-2">
                     {lastUpdateError.scraper && <strong className="capitalize">{lastUpdateError.scraper}: </strong>}
                     {lastUpdateError.error}
                  </p>
               </PopoverContent>
            </Popover>
         )}
      </div>
   );
}

// ── Position ───────────────────────────────────────────────────────────────

type RankProps = { position: number; updating?: boolean; className?: string };

/** A rank. 0 means the keyword is not in the results, which is different from a real position, so it shows a dash. */
export function Rank({ position, updating = false, className }: RankProps) {
   if (updating) {
      return <Loader2 className={cn('text-muted-foreground size-4 animate-spin', className)} aria-label="Updating keyword position" />;
   }
   if (!position) {
      return <span className={cn('text-muted-foreground', className)} title="No results">-</span>;
   }
   return <span className={className}>{Math.round(position)}</span>;
}

export function PositionCell({ keyword }: { keyword: KeywordType }) {
   const change = useMemo(() => getPositionChange(keyword.history ?? {}, keyword.position), [keyword.history, keyword.position]);
   return (
      <span className="font-semibold">
         <Rank position={keyword.position} updating={keyword.updating} />
         {!keyword.updating && change > 0 && <span className="ml-1 text-xs text-emerald-600">▲ {change}</span>}
         {!keyword.updating && change < 0 && <span className="ml-1 text-xs text-red-500">▼ {Math.abs(change)}</span>}
      </span>
   );
}

export function BestCell({ keyword }: { keyword: KeywordType }) {
   const best = useMemo(() => getBestPosition(keyword.history ?? {}), [keyword.history]);
   const title = best ? formatDateKey(String(best.date), { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }) : '';
   return <span className="font-semibold" title={title}>{best ? best.position : (keyword.position || '-')}</span>;
}

// ── History sparkline ──────────────────────────────────────────────────────

const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 24;
const SPARK_PAD = 3;

/** Seven days of positions. A better rank is drawn higher, and days without a ranking sit at the bottom (111). */
export function Sparkline({ history, onClick }: { history: KeywordHistory; onClick?: () => void }) {
   const { series, labels } = useMemo(() => generateTheChartData(history ?? {}, '7'), [history]);
   if (series.length === 0) { return null; }

   const low = Math.min(...series);
   const high = Math.max(...series);
   const span = high - low;
   const points = series.map((value, index) => {
      const x = SPARK_PAD + (index / Math.max(series.length - 1, 1)) * (SPARK_WIDTH - SPARK_PAD * 2);
      const y = span === 0 ? SPARK_HEIGHT / 2 : SPARK_PAD + ((value - low) / span) * (SPARK_HEIGHT - SPARK_PAD * 2);
      return { x, y };
   });
   const last = points[points.length - 1];

   return (
      <button type="button" className="block" data-testid="keyword-history-chart" aria-label="Open the position history" onClick={onClick}>
         <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} role="img" aria-label={`Positions over ${labels.length} days`}>
            <polyline
               fill="none"
               stroke="var(--primary)"
               strokeWidth="1.5"
               strokeLinejoin="round"
               strokeLinecap="round"
               points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            />
            <circle cx={last.x} cy={last.y} r="2" fill="var(--primary)" />
         </svg>
      </button>
   );
}

// ── URL, updated, Search Console ───────────────────────────────────────────

export function UrlCell({ keyword }: { keyword: KeywordType }) {
   const { url = '', domain } = keyword;
   const shortUrl = url.replace(`https://${domain}`, '').replace(`https://www.${domain}`, '').replace(`http://${domain}`, '');
   const safeUrl = safeHttpUrl(url);
   const text = shortUrl || '-';
   return safeUrl
      ? <a href={safeUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground block truncate" title={url}>{text}</a>
      : <span className="text-muted-foreground block truncate">{text}</span>;
}

export function UpdatedCell({ lastUpdated }: { lastUpdated: string }) {
   return (
      <span className="text-muted-foreground text-xs" suppressHydrationWarning title={formatUpdatedTitle(lastUpdated)}>
         {lastUpdated ? dayjs(lastUpdated).fromNow() : '-'}
      </span>
   );
}

export function SearchConsoleCell({ keyword, period }: { keyword: KeywordType; period: string }) {
   const key = period as keyof KeywordSCDataChild;
   const sc = keyword.scData;
   return (
      <div className="flex w-full justify-between text-center text-sm">
         <span className="min-w-10"><Rank position={sc?.position[key] || 0} /></span>
         <span className="min-w-10">{sc?.impressions[key] || 0}</span>
         <span className="min-w-10">{sc?.visits[key] || 0}</span>
      </div>
   );
}

// ── Row actions ────────────────────────────────────────────────────────────

type RowActionsProps = {
   keyword: KeywordType;
   onRefresh: (keyword: KeywordType) => void;
   onToggleFavorite: (keyword: KeywordType) => void;
   onManageTags: (keyword: KeywordType) => void;
   onRemove: (keyword: KeywordType) => void;
};

export function RowActions({ keyword, onRefresh, onToggleFavorite, onManageTags, onRemove }: RowActionsProps) {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${keyword.keyword}`} onClick={(event) => event.stopPropagation()}>
               <Ellipsis />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => onRefresh(keyword)}><RefreshCw />Refresh keyword</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleFavorite(keyword)}>
               <Star />{keyword.sticky ? 'Unfavorite keyword' : 'Favorite keyword'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onManageTags(keyword)}><Tags />Add/Edit tags</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onRemove(keyword)}><Trash2 />Remove keyword</DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
