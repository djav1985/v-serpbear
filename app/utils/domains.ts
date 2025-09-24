import Keyword from '../database/models/keyword';
import parseKeywords from './parseKeywords';
import { readLocalSCData } from './searchConsole';

/**
 * The function `getdomainStats` takes an array of domain objects, retrieves keyword and stats data for
 * each domain, and calculates various statistics for each domain.
 * @param {DomainType[]} domains - An array of objects of type DomainType.
 * @returns {DomainType[]} - An array of objects of type DomainType.
 */
const getdomainStats = async (domains:DomainType[]): Promise<DomainType[]> => {
   const finalDomains: DomainType[] = [];

   for (const domain of domains) {
      const domainWithStat = domain;

      // First Get ALl The Keywords for this Domain
      const allKeywords:Keyword[] = await Keyword.findAll({ where: { domain: domain.domain } });
      const keywords: KeywordType[] = parseKeywords(allKeywords.map((e) => e.get({ plain: true })));
      domainWithStat.keywordsTracked = keywords.length;
      const { mapPackKeywords, keywordPositions, KeywordsUpdateDates } = keywords.reduce(
        (stats, keyword) => {
          if (keyword.mapPackTop3 === true) {
            stats.mapPackKeywords++;
          }
          stats.keywordPositions += keyword.position;
          stats.KeywordsUpdateDates.push(new Date(keyword.lastUpdated).getTime());
          return stats;
        },
        { mapPackKeywords: 0, keywordPositions: 0, KeywordsUpdateDates: [0] as number[] },
      );
      domainWithStat.mapPackKeywords = mapPackKeywords;
      const lastKeywordUpdateDate = Math.max(...KeywordsUpdateDates);
      domainWithStat.keywordsUpdated = new Date(lastKeywordUpdateDate || new Date(domain.lastUpdated).getTime()).toJSON();
      domainWithStat.avgPosition = keywords.length > 0 ? Math.round(keywordPositions / keywords.length) : 0;

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
