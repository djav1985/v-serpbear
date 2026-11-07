/**
 * Credentials that the settings API never sends back to the browser. A GET answers with SECRET_SETTING_MASK in place
 * of a saved value (and '' when nothing is saved), and a save that sends the mask back keeps the stored value.
 * Only credentials are masked. Identifiers the settings forms need to show (Search Console client email, Google Ads
 * client ID and account ID) are still returned as they are.
 */
export const SECRET_SETTING_MASK = '•'.repeat(8);

export const MASKED_SETTINGS_FIELDS = [
   'scraping_api',
   'smtp_password',
   'search_console_private_key',
   'adwords_client_secret',
   'adwords_refresh_token',
   'adwords_developer_token',
] as const;

export const isSecretMask = (value: unknown): boolean => value === SECRET_SETTING_MASK;

/** A copy of the settings where each saved credential is replaced by the mask and each empty one by ''. */
export const maskSettingsSecrets = <T extends object>(settings: T): T => {
   const masked = { ...settings } as Record<string, unknown>;
   MASKED_SETTINGS_FIELDS.forEach((field) => {
      if (field in masked) {
         masked[field] = masked[field] ? SECRET_SETTING_MASK : '';
      }
   });
   return masked as T;
};
