import Keyword from '../database/models/keyword';
import { normalizeToBoolean } from './dbBooleans';
import { safeJsonParse } from './safeJsonParse';

export const normaliseHistory = (rawHistory: unknown): KeywordHistory => {
   if (!rawHistory || typeof rawHistory !== 'object' || Array.isArray(rawHistory)) {
      return {};
   }

   return Object.entries(rawHistory as Record<string, unknown>).reduce<KeywordHistory>((acc, [key, value]) => {
      if (!key) { return acc; }

      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(numericValue)) {
         acc[key] = numericValue;
      }
      return acc;
   }, {});
};

/**
 * Parses the SQL Keyword Model object to frontend cosumable object.
 * @param {Keyword[]} allKeywords - Keywords to scrape
 * @returns {KeywordType[]}
 */
const parseKeywords = (allKeywords: Keyword[]) : KeywordType[] => {
   const parsedItems = allKeywords.map((keywrd:Keyword) => {
      const keywordData = keywrd as unknown as Record<string, any>;

      // Use safeJsonParse helper and skip parsing when already an object
      const historyRaw = typeof keywordData.history === 'string' 
         ? safeJsonParse<unknown>(keywordData.history, {}, {})
         : (keywordData.history || {});
      const history = normaliseHistory(historyRaw);

      const tags = typeof keywordData.tags === 'string'
         ? safeJsonParse<string[]>(keywordData.tags, [], {})
         : (Array.isArray(keywordData.tags) ? keywordData.tags : []);

      const lastResult = typeof keywordData.lastResult === 'string'
         ? safeJsonParse<any[]>(keywordData.lastResult, [], {})
         : (Array.isArray(keywordData.lastResult) ? keywordData.lastResult : []);

      const localResults = typeof keywordData.localResults === 'string'
         ? safeJsonParse<any[]>(keywordData.localResults, [], {})
         : (Array.isArray(keywordData.localResults) ? keywordData.localResults : []);

      let lastUpdateError: any = false;
      if (typeof keywordData.lastUpdateError === 'string' && keywordData.lastUpdateError !== 'false' && keywordData.lastUpdateError.includes('{')) {
         lastUpdateError = safeJsonParse<any>(keywordData.lastUpdateError, {}, {});
      }

      return {
         ...keywordData,
         location: typeof keywordData.location === 'string' ? keywordData.location : '',
         history,
         tags,
         lastResult,
         localResults,
         lastUpdateError,
         sticky: normalizeToBoolean(keywordData.sticky),
         updating: normalizeToBoolean(keywordData.updating),
         mapPackTop3: normalizeToBoolean(keywordData.mapPackTop3),
      } as KeywordType;
   });
   return parsedItems;
};

export default parseKeywords;
