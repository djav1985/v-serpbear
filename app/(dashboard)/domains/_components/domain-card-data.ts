import { safeJsonParse } from 'utils/safeJsonParse';

/** The fields one domain card shows. Plain values only, so the server can hand it to the client untouched. */
export type DomainCardData = {
   id: number;
   domain: string;
   slug: string;
   keywordsUpdated: string | null;
   keywordsTracked: number;
   prevKeywordsTracked: number | null;
   avgPosition: number;
   prevAvgPosition: number | null;
   mapPackKeywords: number;
   prevMapPackKeywords: number | null;
   scVisits: number;
   scVisitsPrev: number | null;
   scImpressions: number;
   scImpressionsPrev: number | null;
   scPosition: number;
   scPositionPrev: number | null;
   scrapeEnabled: boolean;
   /** Credits left on the scraper account this domain uses, or null when the scraper does not report it. */
   creditsRemaining: number | null;
   creditsUnit: 'credits' | 'usd';
   /** True when this domain has its own Search Console credentials (the global integration is handled separately). */
   hasOwnSearchConsole: boolean;
};

const toNumber = (value: unknown): number => {
   const parsed = Number(value);
   return Number.isFinite(parsed) ? parsed : 0;
};

const toPrevious = (value: unknown): number | null => (
   typeof value === 'number' && Number.isFinite(value) ? value : null
);

/** Maps the `/api/serp/domains?withstats=true` shape to what the card needs. Used on the server and after a refetch. */
export const toDomainCardData = (domain: DomainType): DomainCardData => {
   const searchConsole = safeJsonParse<DomainSearchConsole | null>(domain?.search_console, null, { context: `domain ${domain?.domain ?? ''} search_console` });
   return {
      id: domain.ID,
      domain: domain.domain,
      slug: domain.slug,
      keywordsUpdated: domain.keywordsUpdated ? String(domain.keywordsUpdated) : null,
      keywordsTracked: toNumber(domain.keywordsTracked),
      prevKeywordsTracked: toPrevious(domain.prevKeywordsTracked),
      avgPosition: toNumber(domain.avgPosition),
      prevAvgPosition: toPrevious(domain.prevAvgPosition),
      mapPackKeywords: toNumber(domain.mapPackKeywords),
      prevMapPackKeywords: toPrevious(domain.prevMapPackKeywords),
      scVisits: toNumber(domain.scVisits),
      scVisitsPrev: toPrevious(domain.scVisitsPrev),
      scImpressions: toNumber(domain.scImpressions),
      scImpressionsPrev: toPrevious(domain.scImpressionsPrev),
      scPosition: toNumber(domain.scPosition),
      scPositionPrev: toPrevious(domain.scPositionPrev),
      scrapeEnabled: Boolean(domain.scrapeEnabled),
      creditsRemaining: toPrevious(domain.creditsRemaining),
      creditsUnit: domain.creditsUnit === 'usd' ? 'usd' : 'credits',
      hasOwnSearchConsole: !!(searchConsole?.client_email && searchConsole?.private_key),
   };
};
