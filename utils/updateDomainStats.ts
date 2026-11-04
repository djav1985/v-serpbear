import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { logger } from './logger';
import { literal } from 'sequelize';

/**
 * Result type for the raw SQL aggregation query
 */
interface DomainStatsQueryResult {
   keywordsTracked: number | string | bigint;
   mapPackKeywords: number | string | bigint;
   totalPosition: number | string | bigint;
   positionCount: number | string | bigint;
}

/**
 * Updates domain statistics (keywordsTracked, avgPosition and mapPackKeywords) based on current keyword data.
 * Before overwriting, the previous values are saved into the prev* columns so the dashboard can show
 * whether each stat went up or down since the last refresh. The prev* columns stay null until a
 * refresh has stored a real baseline (a previous keywordsTracked above zero).
 * Uses SQL aggregation for improved performance over fetching all keywords.
 *
 * Note: This function assumes boolean fields in the database are stored as integers (0/1).
 * The mapPackTop3 field comparison uses `= 1` to identify truthy values.
 *
 * @param {string} domainName - The domain to update stats for
 * @returns {Promise<void>}
 */
export const updateDomainStats = async (domainName: string): Promise<void> => {
   try {
      const previous = await Domain.findOne({
         where: { domain: domainName },
         attributes: ['avgPosition', 'mapPackKeywords', 'keywordsTracked'],
         raw: true,
      }) as { avgPosition: number | null, mapPackKeywords: number | null, keywordsTracked: number | null } | null;

      // prev* holds the value before the last change, so it is only replaced when a stat actually changes.
      // An unchanged recalculation (for example a refresh that did not move any position) leaves it alone.
      const snapshotFor = (next: { keywordsTracked: number, avgPosition: number, mapPackKeywords: number }) => {
         const unchanged = Number(previous?.keywordsTracked) === next.keywordsTracked
            && Number(previous?.avgPosition) === next.avgPosition
            && Number(previous?.mapPackKeywords) === next.mapPackKeywords;
         if (unchanged || !previous) {
            return {};
         }
         const hasBaseline = Number(previous.keywordsTracked) > 0;
         return {
            prevKeywordsTracked: hasBaseline ? Number(previous.keywordsTracked) : null,
            prevAvgPosition: hasBaseline ? Number(previous.avgPosition) || 0 : null,
            prevMapPackKeywords: hasBaseline ? Number(previous.mapPackKeywords) || 0 : null,
         };
      };

      // Use SQL aggregation to calculate stats efficiently
      const stats = await Keyword.findOne({
         where: { domain: domainName },
         attributes: [
            [literal('COUNT(*)'), 'keywordsTracked'],
            // Count keywords with mapPackTop3 = 1 (truthy boolean value stored as integer)
            [literal('COALESCE(SUM(CASE WHEN mapPackTop3 = 1 THEN 1 ELSE 0 END), 0)'), 'mapPackKeywords'],
            // Sum positions for keywords with position > 0
            [literal('COALESCE(SUM(CASE WHEN position > 0 THEN position ELSE 0 END), 0)'), 'totalPosition'],
            // Count keywords with position > 0
            [literal('COALESCE(SUM(CASE WHEN position > 0 THEN 1 ELSE 0 END), 0)'), 'positionCount'],
         ],
         raw: true,
      }) as unknown as DomainStatsQueryResult;

      // Extract aggregated values. The aggregate has no GROUP BY, so it always returns one row
      // (all zeros when the domain has no keywords), which keeps the domain record in sync.
      const keywordsTracked = Number(stats.keywordsTracked) || 0;
      const mapPackKeywords = Number(stats.mapPackKeywords) || 0;
      const totalPosition = Number(stats.totalPosition) || 0;
      const positionCount = Number(stats.positionCount) || 0;

      // Calculate average position
      const avgPosition = positionCount > 0
         ? Math.round(totalPosition / positionCount)
         : 0;

      // Update domain record
      const nextStats = { keywordsTracked, avgPosition, mapPackKeywords };
      await Domain.update(
         {
            ...nextStats,
            ...snapshotFor(nextStats),
         },
         { where: { domain: domainName } }
      );

      logger.info(`Updated domain stats for ${domainName}`, { keywordsTracked, avgPosition, mapPackKeywords });
   } catch (error) {
      logger.error(`Failed to update domain stats for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
   }
};
