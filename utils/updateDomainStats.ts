import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { logger } from './logger';
import { getAppSettings } from '../pages/api/settings';
import { AveragePositionKeyword, getUnrankedPenalty, roundAveragePosition, summarizeAveragePosition } from './averagePosition';
import { withKeyedMutex } from './keyedMutex';

/**
 * The domain row fields read before a refresh: the stored stats (for the prev* snapshot) and the scrape settings
 * (for the penalty of unranked keywords).
 */
interface PreviousDomainRow {
   avgPosition: number | null;
   mapPackKeywords: number | null;
   keywordsTracked: number | null;
   scrape_strategy: string | null;
   scrape_pagination_limit: number | null;
}

/** Delay before the single retry of a failed stats update */
const RETRY_DELAY_MS = 250;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * One attempt at recalculating and saving the domain stats. Throws on failure.
 */
const attemptDomainStatsUpdate = async (domainName: string): Promise<void> => {
   const previous = await Domain.findOne({
      where: { domain: domainName },
      attributes: ['avgPosition', 'mapPackKeywords', 'keywordsTracked', 'scrape_strategy', 'scrape_pagination_limit'],
      raw: true,
   }) as unknown as PreviousDomainRow | null;

   // prev* holds the value before the last change, so it is only replaced when a stat actually changes.
   // An unchanged recalculation (for example a refresh that did not move any position) leaves it alone.
   const snapshotFor = (next: { keywordsTracked: number, avgPosition: number, mapPackKeywords: number }) => {
      const unchanged = Number(previous?.keywordsTracked) === next.keywordsTracked
         && roundAveragePosition(Number(previous?.avgPosition)) === next.avgPosition
         && Number(previous?.mapPackKeywords) === next.mapPackKeywords;
      if (unchanged || !previous) {
         return {};
      }
      const hasBaseline = Number(previous.keywordsTracked) > 0;
      return {
         prevKeywordsTracked: hasBaseline ? Number(previous.keywordsTracked) : null,
         prevAvgPosition: hasBaseline ? roundAveragePosition(Number(previous.avgPosition) || 0) : null,
         prevMapPackKeywords: hasBaseline ? Number(previous.mapPackKeywords) || 0 : null,
      };
   };

   // Only the columns the average needs. The aggregate is computed in JS because the rule needs each keyword's history.
   // Global settings come from getAppSettings, the same source generateEmail uses, so defaults (for example
   // scrape_pagination_limit) are applied the same way on both paths.
   const [keywordRows, globalSettings] = await Promise.all([
      Keyword.findAll({
         where: { domain: domainName },
         attributes: ['position', 'mapPackTop3', 'lastUpdateError', 'history', 'localResults'],
         raw: true,
      }) as unknown as Promise<AveragePositionKeyword[]>,
      getAppSettings(),
   ]);

   const summary = summarizeAveragePosition(
      keywordRows,
      getUnrankedPenalty(globalSettings, previous),
   );

   // Update domain record
   const nextStats = {
      keywordsTracked: summary.keywordsTracked,
      avgPosition: summary.avgPosition,
      mapPackKeywords: summary.mapPackKeywords,
   };
   await Domain.update(
      {
         ...nextStats,
         ...snapshotFor(nextStats),
      },
      { where: { domain: domainName } }
   );

   logger.info(`Updated domain stats for ${domainName}`, nextStats);
};

/**
 * Updates domain statistics (keywordsTracked, avgPosition and mapPackKeywords) based on current keyword data.
 * avgPosition is rounded to a whole number. It follows the rule in utils/averagePosition (summarizeAveragePosition):
 * - a map pack keyword with a known spot counts at the better of its spot and its organic position (organic 0 ignored);
 * - ranked keywords (position > 0) whose latest scrape did not fail count at their position;
 * - a keyword at 0 that ranked before and is not in the map pack counts at the unranked penalty
 *   (10 x pages scraped, see getUnrankedPenalty);
 * - keywords that never ranked, map pack zeros and keywords whose latest scrape failed are left out of the average.
 * All keywords still count in keywordsTracked.
 * Before overwriting, the previous values are saved into the prev* columns so the dashboard can show
 * whether each stat went up or down since the last refresh. The prev* columns stay null until a
 * refresh has stored a real baseline (a previous keywordsTracked above zero).
 *
 * If an attempt fails, it is retried exactly once after a short delay. If the retry also fails, the error is
 * logged and swallowed; this function never throws.
 *
 * @param {string} domainName - The domain to update stats for
 * @returns {Promise<boolean>} true when the stats were saved (first try or retry), false when both attempts failed
 */
export const updateDomainStats = async (domainName: string): Promise<boolean> => withKeyedMutex(`domain-stats:${domainName.toLowerCase()}`, async () => {
   try {
      await attemptDomainStatsUpdate(domainName);
      return true;
   } catch (error) {
      logger.warn(`Domain stats update failed for ${domainName}, retrying once in ${RETRY_DELAY_MS}ms`, {
         error: toError(error).message,
      });
   }

   await wait(RETRY_DELAY_MS);

   try {
      await attemptDomainStatsUpdate(domainName);
      return true;
   } catch (error) {
      logger.error(`Failed to update domain stats for ${domainName}`, toError(error));
      return false;
   }
});
