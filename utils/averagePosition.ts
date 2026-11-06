/**
 * Shared rules for a domain's average position, so the dashboard card and the email show the same number.
 * Used by the server (updateDomainStats, generateEmail) and by the client card (DomainItem).
 * Keep this file free of server-only imports: the client bundles it.
 */
import { normalizeToBoolean } from './dbBooleans';

/**
 * Penalty position per scraped page. A keyword that ranked before but is now out of the results counts at
 * UNRANKED_PENALTY_PER_PAGE x pages scraped, so dropping out of the results worsens the average.
 */
export const UNRANKED_PENALTY_PER_PAGE = 10;

/** The scrape settings that decide how many pages a domain is scraped for. */
export type PenaltySettings = {
   scrape_strategy?: string | null,
   scrape_pagination_limit?: number | string | null,
};

/**
 * Rounds an average to a whole number. This is the precision stored on the domain (avgPosition, prevAvgPosition).
 * @param {number} value - Raw average, for example 14 / 3
 * @returns {number} - Rounded average, for example 5
 */
export const roundAveragePosition = (value: number): number => Math.round(value);

/**
 * Formats an average for display as a whole number string (5).
 * @param {number} value - Average position
 * @returns {string}
 */
export const formatAveragePosition = (value: number): string => {
   if (!Number.isFinite(value)) {
      return '0';
   }
   return roundAveragePosition(value).toString();
};

/**
 * Whether a keyword's latest scrape failed. Matches parseKeywords: lastUpdateError is stored as the string 'false'
 * (or null) when the last scrape worked, and as a JSON error object otherwise. Accepts the stored value or the parsed one.
 * @param {unknown} lastUpdateError - Raw stored value or parsed lastUpdateError
 * @returns {boolean}
 */
export const hasKeywordError = (lastUpdateError: unknown): boolean => {
   if (typeof lastUpdateError === 'string') {
      return lastUpdateError !== 'false' && lastUpdateError.includes('{');
   }
   return Boolean(lastUpdateError) && typeof lastUpdateError === 'object';
};

/**
 * Pages scraped per keyword for a domain. The effective strategy is the domain's scrape_strategy when set, otherwise
 * the global one. Anything other than 'custom' is basic, which scrapes page 1 only. A custom strategy uses the domain's
 * scrape_pagination_limit, then the global one, then 1.
 * @param {PenaltySettings} globalSettings - App-wide scrape settings
 * @param {PenaltySettings} domainSettings - The domain's own scrape settings (optional)
 * @returns {number}
 */
const getScrapedPageCount = (globalSettings?: PenaltySettings | null, domainSettings?: PenaltySettings | null): number => {
   const strategy = domainSettings?.scrape_strategy || globalSettings?.scrape_strategy;
   if (strategy !== 'custom') {
      return 1;
   }
   return Number(domainSettings?.scrape_pagination_limit) || Number(globalSettings?.scrape_pagination_limit) || 1;
};

/**
 * The position a keyword counts at in the average when it ranked before but is at 0 now and is not in the map pack.
 * PENALTY = UNRANKED_PENALTY_PER_PAGE x pages scraped for the domain.
 * @param {PenaltySettings} globalSettings - App-wide scrape settings
 * @param {PenaltySettings} domainSettings - The domain's own scrape settings (optional)
 * @returns {number}
 */
export const getUnrankedPenalty = (globalSettings?: PenaltySettings | null, domainSettings?: PenaltySettings | null): number => (
   UNRANKED_PENALTY_PER_PAGE * getScrapedPageCount(globalSettings, domainSettings)
);

/**
 * Whether a keyword history (stored JSON string, or parsed object of dateKey -> position) has any ranked position (> 0).
 * @param {unknown} history - Raw or parsed history
 * @returns {boolean}
 */
export const hasRankedBefore = (history: unknown): boolean => {
   let parsed = history;
   if (typeof history === 'string') {
      try {
         parsed = JSON.parse(history);
      } catch {
         return false;
      }
   }
   if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
   }
   return Object.values(parsed as Record<string, unknown>).some((value) => Number(value) > 0);
};

/**
 * The map pack spot (1, 2 or 3) of the tracked business, from a keyword's localResults (stored JSON string, or parsed array).
 * The spot is the position of the entry flagged isOwn. Returns null when there is no such entry with a position of 1..3,
 * or when localResults is empty or malformed (for example old rows).
 * @param {unknown} localResults - Raw stored or parsed localResults
 * @returns {number | null}
 */
export const getMapPackSpot = (localResults: unknown): number | null => {
   let parsed = localResults;
   if (typeof localResults === 'string') {
      try {
         parsed = JSON.parse(localResults);
      } catch {
         return null;
      }
   }
   if (!Array.isArray(parsed)) {
      return null;
   }
   for (const entry of parsed) {
      if (entry && typeof entry === 'object' && (entry as Record<string, unknown>).isOwn === true) {
         const spot = Number((entry as Record<string, unknown>).position);
         if (Number.isInteger(spot) && spot >= 1 && spot <= 3) {
            return spot;
         }
      }
   }
   return null;
};

/** The keyword fields the average needs. Accepts raw database rows and parsed keywords. */
export type AveragePositionKeyword = {
   position?: unknown,
   mapPackTop3?: unknown,
   lastUpdateError?: unknown,
   history?: unknown,
   localResults?: unknown,
};

export type AveragePositionSummary = {
   keywordsTracked: number,
   mapPackKeywords: number,
   totalPosition: number,
   positionCount: number,
   /** Rounded average, 0 when no keyword counts */
   avgPosition: number,
};

/**
 * The rule behind a domain's average position:
 * - latest scrape failed: left out of the average.
 * - map pack keyword with a map pack spot (see getMapPackSpot): counts at the better (lower) of its spot and its
 *   organic position, where organic 0 is ignored. It is ranking, so it is never penalized.
 * - otherwise, position > 0: counts at its position.
 * - otherwise, position 0, ranked before (history has a value > 0), not in the map pack top 3: counts at unrankedPenalty.
 * - anything else (never ranked, map pack zero without a spot): left out of the average.
 * keywordsTracked and mapPackKeywords count every keyword.
 * @param {AveragePositionKeyword[]} keywords - All keywords of the domain
 * @param {number} unrankedPenalty - Position used for a keyword that ranked before and dropped out (see getUnrankedPenalty)
 * @returns {AveragePositionSummary}
 */
export const summarizeAveragePosition = (keywords: AveragePositionKeyword[], unrankedPenalty: number): AveragePositionSummary => {
   const summary: AveragePositionSummary = {
      keywordsTracked: keywords.length,
      mapPackKeywords: 0,
      totalPosition: 0,
      positionCount: 0,
      avgPosition: 0,
   };

   keywords.forEach((keyword) => {
      const inMapPack = normalizeToBoolean(keyword.mapPackTop3);
      if (inMapPack) {
         summary.mapPackKeywords += 1;
      }
      if (hasKeywordError(keyword.lastUpdateError)) {
         return;
      }
      const position = Number(keyword.position);
      if (!Number.isFinite(position)) {
         return;
      }

      const mapPackSpot = inMapPack ? getMapPackSpot(keyword.localResults) : null;
      let counted: number | null = null;
      if (mapPackSpot !== null) {
         counted = position > 0 ? Math.min(mapPackSpot, position) : mapPackSpot;
      } else if (position > 0) {
         counted = position;
      } else if (!inMapPack && hasRankedBefore(keyword.history)) {
         counted = unrankedPenalty;
      }

      if (counted !== null) {
         summary.totalPosition += counted;
         summary.positionCount += 1;
      }
   });

   if (summary.positionCount > 0) {
      summary.avgPosition = roundAveragePosition(summary.totalPosition / summary.positionCount);
   }
   return summary;
};
