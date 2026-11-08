/**
 * The function `sortInsightItems` sorts an array of `SCInsightItem` objects based on a specified property.
 * @param {SCInsightItem[]} items - An array of SCInsightItem objects.
 * @param {string} [sortBy=clicks] - The `sortBy` parameter determines the property by which the `items` array should be sorted.
 * @returns {SCInsightItem[]}
 */
import { logger } from './logger';

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
      logger.debug('[GOOGLE] Invalid SCData provided to getCountryInsight');
      return [];
   }

   // One pass over the rows: each row is added to its country's totals, so the work grows linearly with the data
   const keywordsCounts = new Map<string, Set<string>>();
   const rowCounts = new Map<string, number>();
   const countryItems = new Map<string, SCInsightItem>();
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.country) { return; }
      const itemData = countryItems.get(itm.country) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      itemData.clicks += itm.clicks || 0;
      itemData.impressions += itm.impressions || 0;
      itemData.ctr += itm.ctr || 0;
      itemData.position += itm.position || 0;
      countryItems.set(itm.country, itemData);
      const countryKeywords = keywordsCounts.get(itm.country) || new Set<string>();
      if (itm.keyword) { countryKeywords.add(itm.keyword); }
      keywordsCounts.set(itm.country, countryKeywords);
      rowCounts.set(itm.country, (rowCounts.get(itm.country) || 0) + 1);
   });

   const countryInsight: SCInsightItem[] = Array.from(countryItems.entries()).map(([countryCode, item]) => {
      const keywordCount = keywordsCounts.get(countryCode)?.size || 1;
      const rowCount = rowCounts.get(countryCode) || 1; // Position and CTR are summed per row, so average over rows
      return {
         ...item,
         position: Math.round(item.position / rowCount),
         ctr: Number((item.ctr / rowCount).toFixed(2)),
         keywords: keywordCount,
         country: countryCode,
      };
   });

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
      logger.debug('[GOOGLE] Invalid SCData provided to getKeywordsInsight');
      return [];
   }

   // Maps are keyed by the exact keyword string, so keywords like "a b" and "a_b" stay distinct
   const keywordItems = new Map<string, SCInsightItem>();
   const keywordCounts = new Map<string, number>();
   const countriesCount = new Map<string, Set<string>>();
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.keyword) { return; }
      const itemData = keywordItems.get(itm.keyword) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      itemData.clicks += itm.clicks || 0;
      itemData.impressions += itm.impressions || 0;
      itemData.ctr += itm.ctr || 0;
      itemData.position += itm.position || 0;
      keywordItems.set(itm.keyword, itemData);
      const countries = countriesCount.get(itm.keyword) || new Set<string>();
      if (itm.country) { countries.add(itm.country); }
      countriesCount.set(itm.keyword, countries);
      keywordCounts.set(itm.keyword, (keywordCounts.get(itm.keyword) || 0) + 1);
   });

   const keywordInsight: SCInsightItem[] = Array.from(keywordItems.entries()).map(([keyword, item]) => {
      const keywordCount = keywordCounts.get(keyword) || 1; // Ensure safe division
      return {
         ...item,
         position: Math.round(item.position / keywordCount),
         ctr: Number((item.ctr / keywordCount).toFixed(2)),
         countries: countriesCount.get(keyword)?.size || 0,
         keyword,
      };
   });

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
      logger.debug('[GOOGLE] Invalid SCData provided to getPagesInsight');
      return [];
   }

   const pagesItems = new Map<string, SCInsightItem>();
   const keywordCounts = new Map<string, number>();
   const countriesCount = new Map<string, Set<string>>();
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   scData.forEach((itm) => {
      if (!itm || !itm.page) { return; }
      const itemData = pagesItems.get(itm.page) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      itemData.clicks += itm.clicks || 0;
      itemData.impressions += itm.impressions || 0;
      itemData.ctr += itm.ctr || 0;
      itemData.position += itm.position || 0;
      pagesItems.set(itm.page, itemData);
      const countries = countriesCount.get(itm.page) || new Set<string>();
      if (itm.country) { countries.add(itm.country); }
      countriesCount.set(itm.page, countries);
      keywordCounts.set(itm.page, (keywordCounts.get(itm.page) || 0) + 1);
   });

   const pagesInsight: SCInsightItem[] = Array.from(pagesItems.entries()).map(([page, item]) => {
      const keywordCount = keywordCounts.get(page) || 1; // Ensure safe division
      return {
         ...item,
         position: Math.round(item.position / keywordCount),
         ctr: Number((item.ctr / keywordCount).toFixed(2)),
         countries: countriesCount.get(page)?.size || 0,
         keywords: keywordCount,
         page,
      };
   });

   return sortBy ? sortInsightItems(pagesInsight, sortBy) : pagesInsight;
};
