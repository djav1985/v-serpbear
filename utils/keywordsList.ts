// Connects the models to the database. Server components import these loaders directly, without an API route
// that would otherwise have loaded it first.
import '../database/database';
import Keyword from '../database/models/keyword';
import { getAppSettings } from './appSettings';
import { historyKeyToTime } from './historyDateKey';
import { logger } from './logger';
import parseKeywords from './parseKeywords';
import { integrateKeywordSCData, readLocalSCData } from './searchConsole';

/**
 * Reads a domain's keywords the way `GET /api/serp/keywords` returns them: seven days of history, the stored search
 * results left out, and Search Console data merged in. Shared by the API handler and by server components.
 *
 * Rows saved before the 7-day history existed need a backfill. It is returned as `backfill` instead of being done here,
 * so the caller can run it after it has answered (`setImmediate(backfill)`).
 */
export const loadDomainKeywords = async (domain: string): Promise<{ keywords: KeywordType[]; backfill: () => void }> => {
   const settings = await getAppSettings();
   const integratedSC = process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL;
   const { search_console_client_email, search_console_private_key } = settings;
   const domainSCData = integratedSC || (search_console_client_email && search_console_private_key)
      ? await readLocalSCData(domain)
      : false;

   const allKeywords:Keyword[] = await Keyword.findAll({ where: { domain } });
   const rows = allKeywords.map((row) => row.get({ plain: true }) as Keyword);
   const keywords: KeywordType[] = parseKeywords(rows);
   
   // Consolidate pipeline: do history slicing + lastResult reset + SC integration in a single pass.
   // Collect legacy rows that need a history7d backfill; the writes happen after the response is sent.
   const backfillQueue: Array<{ id: number; history7d: string; source: Keyword }> = [];

   const processedKeywords = keywords.map((keyword, index) => {
      let lastWeekHistory: KeywordHistory;

      if (keyword.history7d && Object.keys(keyword.history7d).length > 0) {
         // Use pre-computed 7-day history (populated at write time) to skip per-request sort
         lastWeekHistory = keyword.history7d;
      } else {
         // Fall back: compute from full history using timestamp-based sort (safe for YYYY-M-D keys)
         const historyEntries = Object.entries(keyword.history);
         if (historyEntries.length <= 7) {
            lastWeekHistory = keyword.history;
         } else {
            lastWeekHistory = {};
            const sortedEntries = historyEntries
               .map(([dateKey, position]) => ({ dateKey, date: historyKeyToTime(dateKey), position }))
               .sort((a, b) => a.date - b.date)
               .slice(-7);
            sortedEntries.forEach(({ dateKey, position }) => {
               lastWeekHistory[dateKey] = position;
            });
         }
         // Queue the backfill — do not write here to avoid per-row DB work on the request path
         if (historyEntries.length > 0) {
            backfillQueue.push({ id: keyword.ID, history7d: JSON.stringify(lastWeekHistory), source: rows[index] });
         }
      }
      
      // Create keyword with slim history and reset lastResult
      const keywordWithSlimHistory = { ...keyword, lastResult: [], history: lastWeekHistory };
      
      // Integrate SC data if available
      const finalKeyword = domainSCData ? integrateKeywordSCData(keywordWithSlimHistory, domainSCData) : keywordWithSlimHistory;
      return finalKeyword;
   });

   const backfill = () => {
      if (backfillQueue.length === 0) { return; }
      backfillQueue.reduce<Promise<void>>(
         (chain, { id, history7d, source }) => chain.then(() => Keyword.update({ history7d }, { where: { ID: id, history: source.history ?? null, history7d: source.history7d ?? null } }).then(() => undefined))
            .catch((err: unknown) => {
               logger.error('Failed to backfill history7d', err instanceof Error ? err : new Error(String(err)), { keywordId: id });
            }),
         Promise.resolve(),
      );
   };

   return { keywords: processedKeywords, backfill };
};
