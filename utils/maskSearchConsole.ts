import { safeJsonParse } from './safeJsonParse';
import { SECRET_MARKER } from './settingsSecrets';

/**
 * Parses a domain's stored search_console JSON and masks it for API responses. The Search Console private key stays on
 * the server: only a 'true' marker says whether a key is saved. The client email is not a secret and is returned as
 * stored. Malformed or empty values give an empty object, so they are never returned unchanged.
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
      client_email: scData.client_email ?? '',
      private_key: scData.private_key ? SECRET_MARKER : '',
   };
};

export default maskSearchConsole;
