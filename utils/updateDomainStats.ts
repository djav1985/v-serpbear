import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { logger } from './logger';
import { fn, literal } from 'sequelize';

/**
 * Updates domain statistics (avgPosition and mapPackKeywords) based on current keyword data.
 * Uses SQL aggregation for improved performance over fetching all keywords.
 * @param {string} domainName - The domain to update stats for
 * @returns {Promise<void>}
 */
export const updateDomainStats = async (domainName: string): Promise<void> => {
   try {
      // Use SQL aggregation to calculate stats efficiently
      const stats = await Keyword.findOne({
         where: { domain: domainName },
         attributes: [
            // Count keywords with mapPackTop3 = 1 (or truthy value)
            [fn('SUM', literal('CASE WHEN mapPackTop3 = 1 THEN 1 ELSE 0 END')), 'mapPackKeywords'],
            // Sum positions for keywords with position > 0
            [fn('SUM', literal('CASE WHEN position > 0 THEN position ELSE 0 END')), 'totalPosition'],
            // Count keywords with position > 0
            [fn('SUM', literal('CASE WHEN position > 0 THEN 1 ELSE 0 END')), 'positionCount'],
         ],
         raw: true,
      });

      if (!stats) {
         logger.info(`No keywords found for domain ${domainName}`);
         return;
      }

      // Extract aggregated values
      const mapPackKeywords = Number(stats.mapPackKeywords) || 0;
      const totalPosition = Number(stats.totalPosition) || 0;
      const positionCount = Number(stats.positionCount) || 0;

      // Calculate average position
      const avgPosition = positionCount > 0 
         ? Math.round(totalPosition / positionCount) 
         : 0;

      // Update domain record
      await Domain.update(
         {
            avgPosition,
            mapPackKeywords,
         },
         { where: { domain: domainName } }
      );

      logger.info(`Updated domain stats for ${domainName}`, { avgPosition, mapPackKeywords });
   } catch (error) {
      logger.error(`Failed to update domain stats for ${domainName}`, error instanceof Error ? error : new Error(String(error)));
   }
};
