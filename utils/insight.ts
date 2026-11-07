/**
 * The function `sortInsightItems` sorts an array of `SCInsightItem` objects based on a specified property.
 * @param {SCInsightItem[]} items - An array of SCInsightItem objects.
 * @param {string} [sortBy=clicks] - The `sortBy` parameter determines the property by which the `items` array should be sorted.
 * @returns {SCInsightItem[]}
 */
import { logger } from './logger';
import { averageSearchConsolePositionFromTotals } from './searchConsolePosition';

export const sortInsightItems = (items:SCInsightItem[], sortBy: string = 'clicks'): SCInsightItem[] => {
   const sortKey = sortBy as keyof SCInsightItem;
   let sortedItems = [];
   switch (sortKey) {
      case 'clicks':
         sortedItems = [...items].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
         break;
      case 'impressions':
         sortedItems = [...items].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
         break;
      case 'position':
         sortedItems = [...items].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
         break;
      default:
         sortedItems = items;
         break;
   }
   return sortedItems;
};

/** Running totals for a group of Search Console rows (one country, keyword or page). */
type InsightTotals = {
   clicks: number,
   impressions: number,
   /** Sum of position x impressions, so busy rows count for more than rarely shown ones */
   weightedPosition: number,
   positionSum: number,
   rows: number,
};

const emptyTotals = (): InsightTotals => ({ clicks: 0, impressions: 0, weightedPosition: 0, positionSum: 0, rows: 0 });

const addRow = (totals: InsightTotals, row: SearchAnalyticsItem): void => {
   const impressions = row.impressions || 0;
   totals.clicks += row.clicks || 0;
   totals.impressions += impressions;
   totals.weightedPosition += (row.position || 0) * impressions;
   totals.positionSum += row.position || 0;
   totals.rows += 1;
};

/**
 * CTR is clicks / impressions (as a percentage) and position is weighted by impressions. Averaging the per-row
 * CTR or position values would let a row with a single impression count as much as one with thousands.
 * A group with no impressions falls back to the plain mean position.
 */
const summarizeTotals = (totals: InsightTotals): { clicks: number, impressions: number, ctr: number, position: number } => ({
   clicks: totals.clicks,
   impressions: totals.impressions,
   ctr: totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
   position: averageSearchConsolePositionFromTotals({
      impressions: totals.impressions,
      weightedPosition: totals.weightedPosition,
      positionTotal: totals.positionSum,
      count: totals.rows,
   }),
});

const readRows = (SCData: SCDomainDataType, queryDate: string): SearchAnalyticsItem[] => {
   const dateKey = queryDate as keyof SCDomainDataType;
   return SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];
};

/**
 * The `getCountryInsight` function takes search analytics data and returns insights about countries based on clicks, impressions, CTR, and position.
 * @param {SCDomainDataType} SCData - The SCData parameter is an object that contains search analytics data for different dates.
 * @param {string} [sortBy=clicks] - The "sortBy" parameter is used to specify the sorting criteria for the country insights.
 * @param {string} [queryDate=thirtyDays] - The `queryDate` parameter is a string that represents the date range for which the search analytics data is retrieved.
 * @returns {SCInsightItem[]}
 */
export const getCountryInsight = (SCData:SCDomainDataType, sortBy:string = 'clicks', queryDate:string = 'thirtyDays') : SCInsightItem[] => {
   // Validate input data
   if (!SCData || typeof SCData !== 'object') {
      logger.warn('Invalid SCData provided to getCountryInsight');
      return [];
   }

   // One pass over the rows: each row is added to its country's totals, so the work grows linearly with the data
   const keywordsByCountry = new Map<string, Set<string>>();
   const totalsByCountry = new Map<string, InsightTotals>();
   const scData = readRows(SCData, queryDate);

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.country) { return; }
      const totals = totalsByCountry.get(itm.country) || emptyTotals();
      addRow(totals, itm);
      totalsByCountry.set(itm.country, totals);
      const countryKeywords = keywordsByCountry.get(itm.country) || new Set<string>();
      if (itm.keyword) { countryKeywords.add(itm.keyword); }
      keywordsByCountry.set(itm.country, countryKeywords);
   });

   const countryInsight: SCInsightItem[] = Array.from(totalsByCountry.entries()).map(([countryCode, totals]) => ({
      ...summarizeTotals(totals),
      keywords: keywordsByCountry.get(countryCode)?.size || 1,
      country: countryCode,
   }));

   return sortBy ? sortInsightItems(countryInsight, sortBy) : countryInsight;
};

/**
 * The `getKeywordsInsight` function takes search analytics data, sorts it based on specified criteria, and returns insights on keywords.
 * @param {SCDomainDataType} SCData - The SCData parameter is of type SCDomainDataType, which is an object containing search analytics data for a specific domain.
 * @param {string} [sortBy=clicks] - The "sortBy" parameter is used to specify the sorting criteria for the keyword insights.
 * @param {string} [queryDate=thirtyDays] - The `queryDate` parameter is a string that represents the date range for which the search analytics data is retrieved.
 * @returns {SCInsightItem[]}
 */
export const getKeywordsInsight = (SCData:SCDomainDataType, sortBy:string = 'clicks', queryDate:string = 'thirtyDays') : SCInsightItem[] => {
   // Validate input data
   if (!SCData || typeof SCData !== 'object') {
      logger.warn('Invalid SCData provided to getKeywordsInsight');
      return [];
   }

   // Maps are keyed by the exact keyword string, so keywords like "a b" and "a_b" stay distinct
   const totalsByKeyword = new Map<string, InsightTotals>();
   const countriesByKeyword = new Map<string, Set<string>>();
   const scData = readRows(SCData, queryDate);

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.keyword) { return; }
      const totals = totalsByKeyword.get(itm.keyword) || emptyTotals();
      addRow(totals, itm);
      totalsByKeyword.set(itm.keyword, totals);
      const countries = countriesByKeyword.get(itm.keyword) || new Set<string>();
      if (itm.country) { countries.add(itm.country); }
      countriesByKeyword.set(itm.keyword, countries);
   });

   const keywordInsight: SCInsightItem[] = Array.from(totalsByKeyword.entries()).map(([keyword, totals]) => ({
      ...summarizeTotals(totals),
      countries: countriesByKeyword.get(keyword)?.size || 0,
      keyword,
   }));

   return sortBy ? sortInsightItems(keywordInsight, sortBy) : keywordInsight;
};

/**
 * The `getPagesInsight` function takes a domain's search analytics data, sorts it based on specified criteria and returns insights about the pages.
 * @param {SCDomainDataType} SCData - SCData is an object that contains search analytics data for a  specific domain.
 * @param {string} [sortBy=clicks] - The `sortBy` parameter is used to specify the sorting criteria for the pages insight.
 * @param {string} [queryDate=thirtyDays] - The `queryDate` parameter is a string that represents the date range for which you want to retrieve the data.
 * @returns {SCInsightItem[]}
 */
export const getPagesInsight = (SCData:SCDomainDataType, sortBy:string = 'clicks', queryDate:string = 'thirtyDays') : SCInsightItem[] => {
   // Validate input data
   if (!SCData || typeof SCData !== 'object') {
      logger.warn('Invalid SCData provided to getPagesInsight');
      return [];
   }

   const totalsByPage = new Map<string, InsightTotals>();
   const keywordsByPage = new Map<string, Set<string>>();
   const countriesByPage = new Map<string, Set<string>>();
   const scData = readRows(SCData, queryDate);

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.page) { return; }
      const totals = totalsByPage.get(itm.page) || emptyTotals();
      addRow(totals, itm);
      totalsByPage.set(itm.page, totals);
      const countries = countriesByPage.get(itm.page) || new Set<string>();
      if (itm.country) { countries.add(itm.country); }
      countriesByPage.set(itm.page, countries);
      // A row is one keyword in one country on one device, so count each keyword once per page
      const keywords = keywordsByPage.get(itm.page) || new Set<string>();
      if (itm.keyword) { keywords.add(itm.keyword); }
      keywordsByPage.set(itm.page, keywords);
   });

   const pagesInsight: SCInsightItem[] = Array.from(totalsByPage.entries()).map(([page, totals]) => ({
      ...summarizeTotals(totals),
      countries: countriesByPage.get(page)?.size || 0,
      keywords: keywordsByPage.get(page)?.size || 0,
      page,
   }));

   return sortBy ? sortInsightItems(pagesInsight, sortBy) : pagesInsight;
};
