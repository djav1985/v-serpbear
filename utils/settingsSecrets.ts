/**
 * Secret handling shared by the server and the browser. This module imports nothing, so client components can use it.
 */

/**
 * Returned in place of a stored secret, and accepted back on save to mean "keep the stored value".
 * Domain Search Console credentials use the same marker.
 */
export const SECRET_MARKER = 'true';

/** App settings stored encrypted. A key present in a save is encrypted (an empty value clears it); an absent or marker value keeps the stored one. */
export const SECRET_SETTINGS_FIELDS = [
   'scraping_api',
   'smtp_password',
   'search_console_private_key',
   'adwords_client_id',
   'adwords_client_secret',
   'adwords_refresh_token',
   'adwords_developer_token',
   'adwords_account_id',
] as const;

/** Replaces every secret with the marker (when set) or an empty string (when unset). Other fields are untouched. */
export const maskSecretSettings = <T extends Record<string, unknown>>(settings: T): T => {
   const masked: Record<string, unknown> = { ...settings };
   SECRET_SETTINGS_FIELDS.forEach((field) => {
      if (field in masked) { masked[field] = masked[field] ? SECRET_MARKER : ''; }
   });
   return masked as T;
};
