import { safeJsonParse } from './safeJsonParse';

/**
 * Parses a domain's stored search_console JSON and masks it for API responses. The Search Console key stays on the
 * server: only a 'true' marker says whether a credential is saved. Malformed or empty values give an empty object,
 * so they are never returned unchanged.
 */
export const maskSearchConsole = (raw: unknown, label: string): Record<string, string> => {
   const scData = safeJsonParse<Record<string, string> | null>(
      raw,
      null,
      { context: `domain ${label} search_console` },
   );
   if (!scData) {
      return {};
   }
   return {
      ...scData,
      client_email: scData.client_email ? 'true' : '',
      private_key: scData.private_key ? 'true' : '',
   };
};

export default maskSearchConsole;
