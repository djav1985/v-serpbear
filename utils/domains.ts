import { Op, literal } from 'sequelize';
import Keyword from '../database/models/keyword';
import { readLocalSCData } from './searchConsole';
import { dateKeyToTime } from './timezone';
import { averageSearchConsolePosition } from './searchConsolePosition';

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
      // Work on a copy, so the caller's objects are not changed
      const domainWithStat = { ...domain };

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
         // Search Console leaves out days with no impressions, so the windows are picked by date, not by row count:
         // the 7 calendar days ending on the latest day with data, and the 7 days before them.
         const datedStats = localSCData.stats
            .map((item) => ({ item, time: dateKeyToTime(item.date) }))
            .filter(({ time }) => Number.isFinite(time))
            .sort((a, b) => a.time - b.time);
         const dayMs = 24 * 60 * 60 * 1000;
         const endTime = datedStats.length > 0 ? datedStats[datedStats.length - 1].time : 0;
         const lastSevenStats = datedStats
            .filter(({ time }) => time > endTime - days * dayMs)
            .map(({ item }) => item);
         if (lastSevenStats.length > 0) {
            const totalStats = lastSevenStats.reduce((acc, item) => ({
               impressions: item.impressions + acc.impressions,
               clicks: item.clicks + acc.clicks,
               ctr: item.ctr + acc.ctr,
            }), { impressions: 0, clicks: 0, ctr: 0 });
            domainWithStat.scVisits = totalStats.clicks;
            domainWithStat.scImpressions = totalStats.impressions;
            domainWithStat.scPosition = averageSearchConsolePosition(lastSevenStats);

            // Compare against the 7 days before the current window, only when the stored data reaches back that far
            const previousSevenStats = datedStats
               .filter(({ time }) => time > endTime - days * 2 * dayMs && time <= endTime - days * dayMs)
               .map(({ item }) => item);
            const coversPreviousWindow = datedStats[0].time <= endTime - (days * 2 - 1) * dayMs;
            if (coversPreviousWindow && previousSevenStats.length > 0) {
               const previousTotals = previousSevenStats.reduce((acc, item) => ({
                  impressions: item.impressions + acc.impressions,
                  clicks: item.clicks + acc.clicks,
               }), { impressions: 0, clicks: 0 });
               domainWithStat.scVisitsPrev = previousTotals.clicks;
               domainWithStat.scImpressionsPrev = previousTotals.impressions;
               domainWithStat.scPositionPrev = averageSearchConsolePosition(previousSevenStats);
            }
         }
      }

      finalDomains.push(domainWithStat);
   }

   return finalDomains;
};

export default getdomainStats;
