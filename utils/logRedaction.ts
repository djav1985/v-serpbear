/**
 * Helpers that strip secrets from values before they are logged.
 */

// Words that mark a field as secret. Keys are split into words first ("smtpPassword" and "smtp_password" both
// give "smtp", "password"), so "key" matches "api_key" and "private_key" but not "keyword" or "keywords".
const SECRET_WORDS = new Set([
   'pass', 'password', 'passwd', 'secret', 'token', 'key', 'apikey', 'api', 'private', 'authorization', 'cookie', 'credential', 'credentials',
]);

const keyWords = (key: string): string[] => key
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase()
   .split(/[^a-z0-9]+/)
   .filter(Boolean);

const isSecretKey = (key: string, extraKeys: Set<string>): boolean => {
   const words = keyWords(key);
   return words.some((word) => SECRET_WORDS.has(word) || extraKeys.has(word));
};

/**
 * Returns a copy of a value with secret-looking string fields replaced, so logs never contain passwords,
 * API keys or private keys. Pass extraKeys for names that are only secret in a given place, for example
 * the OAuth `code` and `state` in a query string.
 */
export const redactSecrets = (value: unknown, extraKeys: string[] = []): unknown => {
   const extra = new Set(extraKeys.map((item) => item.toLowerCase()));
   const walk = (current: unknown): unknown => {
      if (Array.isArray(current)) {
         return current.map((item) => walk(item));
      }
      if (current && typeof current === 'object') {
         return Object.fromEntries(
            Object.entries(current as Record<string, unknown>).map(([key, nested]) => [
               key,
               isSecretKey(key, extra) && typeof nested === 'string' && nested.length > 0 ? '[REDACTED]' : walk(nested),
            ]),
         );
      }
      return current;
   };
   return walk(value);
};

/**
 * Removes OAuth `code` and `state` values from a request URL before it is logged.
 */
export const redactUrl = (url?: string): string => (url || '').replace(/([?&](?:code|state)=)[^&]*/g, '$1[REDACTED]');
