import Keyword from '../database/models/keyword';
import { col, fn } from 'sequelize';
import { readLocalSCData } from './searchConsole';

/**
 * The function `getdomainStats` takes an array of domain objects, retrieves keyword and stats data for
 * each domain, and calculates various statistics for each domain.
 * @param {DomainType[]} domains - An array of objects of type DomainType.
 * @returns {DomainType[]} - An array of objects of type DomainType.
 */
const getdomainStats = async (domains:DomainType[]): Promise<DomainType[]> => {
   const finalDomains: DomainType[] = [];
   const domainNames = domains.map((domain) => domain.domain);
   const keywordStatsRows = domainNames.length > 0
      ? await Keyword.findAll({
         attributes: [
            'domain',
            [fn('COUNT', col('ID')), 'keywordCount'],
            [fn('MAX', col('lastUpdated')), 'maxLastUpdated'],
         ],
         where: { domain: domainNames },
         group: ['domain'],
         raw: true,
      }) as unknown as Array<{ domain: string; keywordCount: string | number; maxLastUpdated: string | null }>
      : [];

   const keywordStatsByDomain = new Map<string, { keywordCount: number; maxLastUpdated: string | null }>();
   keywordStatsRows.forEach((row) => {
      keywordStatsByDomain.set(row.domain, {
         keywordCount: Number(row.keywordCount) || 0,
         maxLastUpdated: row.maxLastUpdated,
      });
   });

   for (const domain of domains) {
      const domainWithStat = domain;
      const keywordStats = keywordStatsByDomain.get(domain.domain);
      domainWithStat.keywordsTracked = keywordStats?.keywordCount || 0;
      
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

      // Get the last updated time from keywords
      const fallbackUpdatedAt = new Date(domain.lastUpdated).toJSON();
      domainWithStat.keywordsUpdated = keywordStats?.maxLastUpdated || fallbackUpdatedAt;

      // Then Load the SC File and read the stats and calculate the Last 7 days stats
      const localSCData = await readLocalSCData(domain.domain);
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
         }
      }

      finalDomains.push(domainWithStat);
   }

   return finalDomains;
};

export default getdomainStats;
