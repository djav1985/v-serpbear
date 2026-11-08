import { normalizeToBoolean } from 'utils/dbBooleans';

/** The database stores flags as 0/1. The interface works with real booleans, on the server and in the browser alike. */
export const normalizeKeyword = (keyword: unknown): KeywordType => {
   if (typeof keyword !== 'object' || keyword === null) { throw new Error('Invalid keyword object'); }
   const record = keyword as Record<string, unknown>;
   return {
      ...record,
      updating: normalizeToBoolean(record.updating),
      sticky: normalizeToBoolean(record.sticky),
      mapPackTop3: normalizeToBoolean(record.mapPackTop3),
   } as KeywordType;
};
