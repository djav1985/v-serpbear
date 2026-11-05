import { logger } from './logger';

const REDIRECT_TIMEOUT_MS = 5000;
const REDIRECT_CONCURRENCY = 5;
const CACHE_MAX_ENTRIES = 500;

// Resolved links are kept for the life of the process: a token always leads to the same page.
const resolvedCache = new Map<string, string>();

const GOOGLE_HOST = /^(www\.)?google\.[a-z.]{2,6}$/i;

const parseGoogleRedirect = (value: string | undefined | null): URL | null => {
   if (!value) { return null; }
   let parsed: URL;
   try {
      parsed = new URL(value);
   } catch (_error) {
      return null;
   }
   if (!/^https?:$/.test(parsed.protocol) || !GOOGLE_HOST.test(parsed.hostname)) { return null; }
   if (parsed.pathname !== '/goto' && parsed.pathname !== '/url') { return null; }
   return parsed;
};

/** True for Google redirect links such as https://www.google.com/goto?url=CAES... or /url?q=https://example.com */
export const isGoogleRedirectUrl = (value: string | undefined | null): boolean => parseGoogleRedirect(value) !== null;

const isHttpUrl = (value: string | null | undefined): value is string => !!value && /^https?:\/\//i.test(value);

/**
 * Turns a Google redirect link into the page it points to. /url?q=<address> carries the address in the query, so no
 * request is needed. /goto?url=<token> is opaque, so one request is made to Google (never to the destination) and the
 * Location header is read without following it. Anything that cannot be resolved is returned unchanged.
 */
export const resolveGoogleRedirect = async (value: string, timeoutMs: number = REDIRECT_TIMEOUT_MS): Promise<string> => {
   const parsed = parseGoogleRedirect(value);
   if (!parsed) { return value; }

   const inline = parsed.searchParams.get('q') || parsed.searchParams.get('url');
   if (isHttpUrl(inline)) { return inline; }

   const cached = resolvedCache.get(value);
   if (cached) { return cached; }

   try {
      const response = await fetch(value, {
         redirect: 'manual',
         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
         signal: AbortSignal.timeout(timeoutMs),
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && isHttpUrl(location)) {
         if (resolvedCache.size >= CACHE_MAX_ENTRIES) {
            const oldest = resolvedCache.keys().next().value;
            if (oldest !== undefined) { resolvedCache.delete(oldest); }
         }
         resolvedCache.set(value, location);
         return location;
      }
      logger.debug('[SCRAPE] Google redirect did not resolve', { status: response.status });
   } catch (error: any) {
      logger.debug('[SCRAPE] Google redirect lookup failed', { error: error?.message || '' });
   }
   return value;
};

/**
 * Resolves the url of every item that is a Google redirect link, a few at a time. A link that cannot be resolved
 * becomes the item's fallbackUrl when it has one, otherwise it is left as it was. fallbackUrl is removed from
 * the items that were processed.
 */
export const resolveGoogleRedirects = async <T extends { url?: string, fallbackUrl?: string }>(items: T[]): Promise<T[]> => {
   const pending = items.map((item, index) => ({ item, index })).filter(({ item }) => isGoogleRedirectUrl(item.url));
   if (pending.length === 0) { return items; }

   const resolved = [...items];
   let next = 0;
   const worker = async () => {
      while (next < pending.length) {
         const { item, index } = pending[next];
         next += 1;
         const url = await resolveGoogleRedirect(item.url as string);
         const { fallbackUrl, ...rest } = item;
         if (url !== item.url) {
            resolved[index] = { ...rest, url } as T;
         } else if (fallbackUrl) {
            resolved[index] = { ...rest, url: fallbackUrl } as T;
         }
      }
   };
   await Promise.all(Array.from({ length: Math.min(REDIRECT_CONCURRENCY, pending.length) }, worker));
   return resolved;
};
