import { Op, literal } from 'sequelize';
import Keyword from '../database/models/keyword';
import { readLocalSCData } from './searchConsole';

interface DomainKeywordAggregate {
   domain: string;
   keywordsTracked: number | string;
   maxLastUpdated: string | null;
}

/**
 * The function `getdomainStats` takes an array of domain objects, retrieves keyword and stats data for
 * each domain, and calculates various statistics for each domain.
 * Uses a single aggregated query instead of one per domain to avoid the N+1 pattern.
 * @param {DomainType[]} domains - An array of objects of type DomainType.
 * @returns {DomainType[]} - An array of objects of type DomainType.
 */
const getdomainStats = async (domains:DomainType[]): Promise<DomainType[]> => {
   if (domains.length === 0) return [];

   const domainNames = domains.map(d => d.domain);

   // Single aggregated query: COUNT(*) + MAX(lastUpdated) grouped by domain
   const aggregateRows = await Keyword.findAll({
      attributes: [
         'domain',
         [literal('COUNT(*)'), 'keywordsTracked'],
         [literal('MAX(lastUpdated)'), 'maxLastUpdated'],
      ],
      where: { domain: { [Op.in]: domainNames } },
      group: ['domain'],
      raw: true,
   }) as unknown as DomainKeywordAggregate[];

   // Build a lookup map for O(1) access per domain
   const statsMap = new Map<string, { keywordsTracked: number; maxLastUpdated: string | null }>();
   for (const row of aggregateRows) {
      statsMap.set(row.domain, {
         keywordsTracked: Number(row.keywordsTracked) || 0,
         maxLastUpdated: row.maxLastUpdated || null,
      });
   }

   const finalDomains: DomainType[] = [];

   // Read every domain's Search Console file in parallel rather than one after another
   const scDataByDomain = await Promise.all(domains.map((domain) => readLocalSCData(domain.domain)));

   for (const [index, domain] of domains.entries()) {
      const domainWithStat = domain;

      const stats = statsMap.get(domain.domain) ?? { keywordsTracked: 0, maxLastUpdated: null };
      domainWithStat.keywordsTracked = stats.keywordsTracked;

      const hasPersistedAvgPosition = typeof domain.avgPosition === 'number'
         && Number.isFinite(domain.avgPosition)
         && domain.avgPosition > 0;

      if (hasPersistedAvgPosition) {
         domainWithStat.avgPosition = domain.avgPosition;
      } else if ('avgPosition' in domainWithStat) {
         delete domainWithStat.avgPosition;
      }

      const hasPersistedMapPackKeywords = typeof domain.mapPackKeywords === 'number'
         && Number.isFinite(domain.mapPackKeywords)
         && domain.mapPackKeywords > 0;

      if (hasPersistedMapPackKeywords) {
         domainWithStat.mapPackKeywords = domain.mapPackKeywords;
      } else if ('mapPackKeywords' in domainWithStat) {
         delete domainWithStat.mapPackKeywords;
      }

      // Derive keywordsUpdated from MAX(lastUpdated) in the aggregate; fall back to domain.lastUpdated
      const maxTs = stats.maxLastUpdated ? new Date(stats.maxLastUpdated).getTime() : 0;
      domainWithStat.keywordsUpdated = new Date(maxTs || new Date(domain.lastUpdated).getTime()).toJSON();

      // Then Load the SC File and read the stats and calculate the Last 7 days stats
      const localSCData = scDataByDomain[index];
      const days = 7;
      if (localSCData && localSCData.stats && Array.isArray(localSCData.stats) && localSCData.stats.length > 0) {
         const lastSevenStats = localSCData.stats.slice(-days);
         if (lastSevenStats.length > 0) {
            const totalStats = lastSevenStats.reduce((acc, item) => ({
               impressions: item.impressions + acc.impressions,
               clicks: item.clicks + acc.clicks,
               ctr: item.ctr + acc.ctr,
               position: item.position + acc.position,
            }), { impressions: 0, clicks: 0, ctr: 0, position: 0 });
            domainWithStat.scVisits = totalStats.clicks;
            domainWithStat.scImpressions = totalStats.impressions;
            domainWithStat.scPosition = lastSevenStats.length > 0 ? Math.round(totalStats.position / lastSevenStats.length) : 0;

            // Compare against the 7 days before the current window, only when that window is complete
            const previousSevenStats = localSCData.stats.slice(-days * 2, -days);
            if (previousSevenStats.length === days) {
               const previousTotals = previousSevenStats.reduce((acc, item) => ({
                  impressions: item.impressions + acc.impressions,
                  clicks: item.clicks + acc.clicks,
                  position: item.position + acc.position,
               }), { impressions: 0, clicks: 0, position: 0 });
               domainWithStat.scVisitsPrev = previousTotals.clicks;
               domainWithStat.scImpressionsPrev = previousTotals.impressions;
               domainWithStat.scPositionPrev = Math.round(previousTotals.position / days);
            }
         }
      }

      finalDomains.push(domainWithStat);
   }

   return finalDomains;
};

export default getdomainStats;
