import Keyword from '../database/models/keyword';
import { normalizeToBoolean } from './dbBooleans';
import { safeJsonParse } from './safeJsonParse';
import { normalizeHistoryDateKey } from './historyDateKey';
import { isRecord } from './typeGuards';

export const normaliseHistory = (rawHistory: unknown): KeywordHistory => {
   if (!rawHistory || typeof rawHistory !== 'object' || Array.isArray(rawHistory)) {
      return {};
   }

   // Keys are padded ("2026-1-5" becomes "2026-01-05"). If both forms exist for one day, the entry already
   // stored under the padded key wins, which is the same rule the history migration applies.
   const entries = Object.entries(rawHistory as Record<string, unknown>)
      .sort(([left], [right]) => Number(normalizeHistoryDateKey(left) === left) - Number(normalizeHistoryDateKey(right) === right));

   return entries.reduce<KeywordHistory>((acc, [key, value]) => {
      if (!key) { return acc; }

      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(numericValue)) {
         acc[normalizeHistoryDateKey(key)] = numericValue;
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
      const keywordData = keywrd as unknown as Record<string, unknown>;

      const historyRaw = typeof keywordData.history === 'string' 
         ? safeJsonParse<unknown>(keywordData.history, {}, { context: `history of keyword ${keywordData.ID}` })
         : (keywordData.history || {});
      const history = normaliseHistory(historyRaw);

      const rawHistory7d = keywordData.history7d;
      const history7d = rawHistory7d != null
         ? normaliseHistory(
            typeof rawHistory7d === 'string'
               ? safeJsonParse<unknown>(rawHistory7d, {}, { context: `7 day history of keyword ${keywordData.ID}` })
               : (rawHistory7d || {}),
         )
         : undefined;

      const tags = typeof keywordData.tags === 'string'
         ? safeJsonParse<string[]>(keywordData.tags, [], { context: `tags of keyword ${keywordData.ID}` })
         : (Array.isArray(keywordData.tags) ? keywordData.tags : []);

      const lastResult = typeof keywordData.lastResult === 'string'
         ? safeJsonParse<KeywordLastResult[]>(keywordData.lastResult, [], { context: `last result of keyword ${keywordData.ID}` })
         : (Array.isArray(keywordData.lastResult) ? keywordData.lastResult : []);

      const localResults = typeof keywordData.localResults === 'string'
         ? safeJsonParse<KeywordLocalResult[]>(keywordData.localResults, [], { context: `local results of keyword ${keywordData.ID}` })
         : (Array.isArray(keywordData.localResults) ? keywordData.localResults : []);

      let lastUpdateError: KeywordType['lastUpdateError'] = false;
      if (typeof keywordData.lastUpdateError === 'string' && keywordData.lastUpdateError !== 'false' && keywordData.lastUpdateError.includes('{')) {
         const parsedError = safeJsonParse<unknown>(keywordData.lastUpdateError, null, { context: `last update error of keyword ${keywordData.ID}` });
         if (isRecord(parsedError)) {
            lastUpdateError = {
               ...(typeof parsedError.date === 'string' ? { date: parsedError.date } : {}),
               ...(typeof parsedError.error === 'string' ? { error: parsedError.error } : {}),
               ...(typeof parsedError.scraper === 'string' ? { scraper: parsedError.scraper } : {}),
               ...(typeof parsedError.reason === 'string' ? { reason: parsedError.reason } : {}),
               ...(typeof parsedError.code === 'string' ? { code: parsedError.code } : {}),
               ...(typeof parsedError.message === 'string' ? { message: parsedError.message } : {}),
            };
         }
      }

      return {
         ...keywordData,
         location: typeof keywordData.location === 'string' ? keywordData.location : '',
         history,
         ...(history7d !== undefined ? { history7d } : {}),
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
