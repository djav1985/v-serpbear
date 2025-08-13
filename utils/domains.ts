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

   const allKeywords: Keyword[] = await Keyword.findAll({ where: { domain: domains.map((d) => d.domain) } });
   const keywordsByDomain = allKeywords.reduce((acc: Record<string, any[]>, kw) => {
      const key = kw.domain as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(kw.get({ plain: true }));
      return acc;
   }, {});

   for (const domain of domains) {
      const domainWithStat = domain;
      const rawKeywords = keywordsByDomain[domain.domain] || [];
      const keywords: KeywordType[] = parseKeywords(rawKeywords);
      domainWithStat.keywordCount = keywords.length;
      if (keywords.length === 0) {
         domainWithStat.avgPosition = 0;
         domainWithStat.keywordsUpdated = domain.lastUpdated;
         finalDomains.push(domainWithStat);
         continue;
      }
      const keywordPositions = keywords.reduce((acc, itm) => (acc + itm.position), 0);
      const KeywordsUpdateDates: number[] = keywords.reduce((acc: number[], itm) => [...acc, new Date(itm.lastUpdated).getTime()], [0]);
      const lastKeywordUpdateDate = Math.max(...KeywordsUpdateDates);
      domainWithStat.keywordsUpdated = new Date(lastKeywordUpdateDate || new Date(domain.lastUpdated).getTime()).toJSON();
      domainWithStat.avgPosition = Math.round(keywordPositions / keywords.length);

      const localSCData = await readLocalSCData(domain.domain);
      const days = 7;
      if (localSCData && localSCData.stats && localSCData.stats.length) {
         const lastSevenStats = localSCData.stats.slice(-days);
         const totalStats = lastSevenStats.reduce((acc, item) => {
            return {
               impressions: item.impressions + acc.impressions,
               clicks: item.clicks + acc.clicks,
               ctr: item.ctr + acc.ctr,
               position: item.position + acc.position,
            };
         }, { impressions: 0, clicks: 0, ctr: 0, position: 0 });
         domainWithStat.scVisits = totalStats.clicks;
         domainWithStat.scImpressions = totalStats.impressions;
         domainWithStat.scPosition = Math.round(totalStats.position / days);
      }

      finalDomains.push(domainWithStat);
   }

   return finalDomains;
};

export default getdomainStats;
