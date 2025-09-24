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
      let historyRaw: unknown;
      try { historyRaw = JSON.parse(keywrd.history); } catch { historyRaw = {}; }
      const history = normaliseHistory(historyRaw);

      let tags: string[] = [];
      try { tags = JSON.parse(keywrd.tags); } catch { tags = []; }

      let lastResult: any[] = [];
      try { lastResult = JSON.parse(keywrd.lastResult); } catch { lastResult = []; }

      let lastUpdateError: any = false;
      if (keywrd.lastUpdateError !== 'false' && keywrd.lastUpdateError.includes('{')) {
         try { lastUpdateError = JSON.parse(keywrd.lastUpdateError); } catch { lastUpdateError = {}; }
      }

      const rawMapPack = (keywrd as any).map_pack_top3 ?? (keywrd as any).mapPackTop3;
      const mapPackTop3 = normaliseBoolean(rawMapPack);

      const updating = normaliseBoolean((keywrd as any).updating);
      const sticky = normaliseBoolean((keywrd as any).sticky);

      return {
         ...keywrd,
         location: typeof (keywrd as any).location === 'string' ? (keywrd as any).location : '',
         history,
         tags,
         lastResult,
         lastUpdateError,
         sticky,
         updating,
         mapPackTop3,
      };
   });
   return parsedItems;
};

export default parseKeywords;
