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
      logger.warn('Invalid SCData provided to getCountryInsight');
      return [];
   }

   const keywordsCounts: { [key:string]: string[] } = {};
   const rowCounts: { [key:string]: number } = {};
   const countryItems: { [key:string]: SCInsightItem } = {};
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   const allCountries: string[] = [...new Set(scData.map((item) => item?.country).filter(Boolean))];

   allCountries.forEach((countryKey:string) => {
      const itemData = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      scData.forEach((itm) => {
         if (itm && itm.country === countryKey) {
            itemData.clicks += itm.clicks || 0;
            itemData.impressions += itm.impressions || 0;
            itemData.ctr += itm.ctr || 0;
            itemData.position += itm.position || 0;
            if (!keywordsCounts[itm.country]) {
               keywordsCounts[itm.country] = [];
            }
            if (keywordsCounts[itm.country] && itm.keyword && !keywordsCounts[itm.country].includes(itm.keyword)) {
               keywordsCounts[itm.country].push(itm.keyword);
            }
            rowCounts[itm.country] = (rowCounts[itm.country] || 0) + 1;
         }
      });
      countryItems[countryKey] = itemData;
   });

   const countryInsight: SCInsightItem[] = Object.keys(countryItems).map((countryCode:string) => {
      const keywordCount = keywordsCounts[countryCode]?.length || 1;
      const rowCount = rowCounts[countryCode] || 1; // Position and CTR are summed per row, so average over rows
      return {
         ...countryItems[countryCode],
         position: Math.round(countryItems[countryCode].position / rowCount),
         ctr: Number((countryItems[countryCode].ctr / rowCount).toFixed(2)),
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
      logger.warn('Invalid SCData provided to getKeywordsInsight');
      return [];
   }

   // Maps are keyed by the exact keyword string, so keywords like "a b" and "a_b" stay distinct
   const keywordItems = new Map<string, SCInsightItem>();
   const keywordCounts = new Map<string, number>();
   const countriesCount = new Map<string, string[]>();
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   const allKeywords: string[] = [...new Set(scData.map((item) => item?.keyword).filter(Boolean))];

   allKeywords.forEach((keyword:string) => {
      const itemData = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      scData.forEach((itm) => {
         if (itm && itm.keyword === keyword) {
            itemData.clicks += itm.clicks || 0;
            itemData.impressions += itm.impressions || 0;
            itemData.ctr += itm.ctr || 0;
            itemData.position += itm.position || 0;
            const countries = countriesCount.get(keyword) || [];
            if (itm.country && !countries.includes(itm.country)) {
               countries.push(itm.country);
            }
            countriesCount.set(keyword, countries);
            keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
         }
      });
      keywordItems.set(keyword, itemData);
   });

   const keywordInsight: SCInsightItem[] = Array.from(keywordItems.entries()).map(([keyword, item]) => {
      const keywordCount = keywordCounts.get(keyword) || 1; // Ensure safe division
      return {
         ...item,
         position: Math.round(item.position / keywordCount),
         ctr: Number((item.ctr / keywordCount).toFixed(2)),
         countries: countriesCount.get(keyword)?.length || 0,
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
      logger.warn('Invalid SCData provided to getPagesInsight');
      return [];
   }

   const pagesItems: { [key:string]: SCInsightItem } = {};
   const keywordCounts: { [key:string]: number } = {};
   const countriesCount: { [key:string]: string[] } = {};
   const dateKey = queryDate as keyof SCDomainDataType;
   const scData = SCData[dateKey] && Array.isArray(SCData[dateKey]) ? SCData[dateKey] as SearchAnalyticsItem[] : [];

   if (scData.length === 0) {
      return [];
   }

   const allPages: string[] = [...new Set(scData.map((item) => item?.page).filter(Boolean))];

   allPages.forEach((page:string) => {
      const itemData = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      scData.forEach((itm) => {
         if (itm && itm.page === page) {
            itemData.clicks += itm.clicks || 0;
            itemData.impressions += itm.impressions || 0;
            itemData.ctr += itm.ctr || 0;
            itemData.position += itm.position || 0;
            if (!countriesCount[page]) {
               countriesCount[page] = [];
            }
            if (countriesCount[page] && itm.country && !countriesCount[page].includes(itm.country)) {
               countriesCount[page].push(itm.country);
            }
            keywordCounts[page] = keywordCounts[page] ? keywordCounts[page] + 1 : 1;
         }
      });
      pagesItems[page] = itemData;
   });

   const pagesInsight: SCInsightItem[] = Object.keys(pagesItems).map((page:string) => {
      const keywordCount = keywordCounts[page] || 1; // Ensure safe division
      return {
         ...pagesItems[page],
         position: Math.round(pagesItems[page].position / keywordCount),
         ctr: Number((pagesItems[page].ctr / keywordCount).toFixed(2)),
         countries: countriesCount[page]?.length || 0,
         keywords: keywordCount,
         page,
      };
   });

   return sortBy ? sortInsightItems(pagesInsight, sortBy) : pagesInsight;
};
