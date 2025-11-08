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
const normaliseBoolean = (value: unknown): boolean => {
   if (typeof value === 'boolean') {
      return value;
   }

   if (typeof value === 'number') {
      return value !== 0;
   }

   if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (['', '0', 'false', 'no', 'off'].includes(trimmed)) {
         return false;
      }
      if (['1', 'true', 'yes', 'on'].includes(trimmed)) {
         return true;
      }

      return false;
   }

   return Boolean(value);
};

const parseKeywords = (allKeywords: Keyword[]) : KeywordType[] => {
   const parsedItems = allKeywords.map((keywrd:Keyword) => {
      const keywordData = keywrd as unknown as Record<string, any>;
      const { mapPackTop3, ...keywordWithoutMapPack } = keywordData;

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

      const normalisedMapPackTop3 = normaliseBoolean(mapPackTop3);

      const updating = normaliseBoolean(keywordData.updating);
      const sticky = normaliseBoolean(keywordData.sticky);

      return {
         ...keywordWithoutMapPack,
         location: typeof keywordData.location === 'string' ? keywordData.location : '',
         history,
         tags,
         lastResult,
         localResults,
         lastUpdateError,
         sticky,
         updating,
         mapPackTop3: normalisedMapPackTop3,
      } as KeywordType;
   });
   return parsedItems;
};

export default parseKeywords;
