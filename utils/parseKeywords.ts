import Keyword from '../database/models/keyword';

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

      let historyRaw: unknown;
      try { historyRaw = JSON.parse(keywordData.history); } catch { historyRaw = {}; }
      const history = normaliseHistory(historyRaw);

      let tags: string[] = [];
      try { tags = JSON.parse(keywordData.tags); } catch { tags = []; }

      let lastResult: any[] = [];
      try { lastResult = JSON.parse(keywordData.lastResult); } catch { lastResult = []; }

      let localResults: any[] = [];
      try { localResults = JSON.parse(keywordData.localResults || '[]'); } catch { localResults = []; }

      let lastUpdateError: any = false;
      if (typeof keywordData.lastUpdateError === 'string' && keywordData.lastUpdateError !== 'false' && keywordData.lastUpdateError.includes('{')) {
         try { lastUpdateError = JSON.parse(keywordData.lastUpdateError); } catch { lastUpdateError = {}; }
      }

      // Integer boolean fields (1/0) are stored and returned by the SQLite dialect as-is.
      // Validate and ensure these fields are numbers (default to 0 if invalid)
      const validateIntegerFlag = (value: any): number => {
         if (typeof value === 'number') return value;
         return 0;
      };

      return {
         ...keywordData,
         location: typeof keywordData.location === 'string' ? keywordData.location : '',
         history,
         tags,
         lastResult,
         localResults,
         lastUpdateError,
         sticky: validateIntegerFlag(keywordData.sticky),
         updating: validateIntegerFlag(keywordData.updating),
         mapPackTop3: validateIntegerFlag(keywordData.mapPackTop3),
      } as KeywordType;
   });
   return parsedItems;
};

export default parseKeywords;
