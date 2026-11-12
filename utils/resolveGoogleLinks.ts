import { logger } from './logger';
import { getUnknownErrorMessage } from './errorSerialization';
import { asRecordArray, getPathValue } from './typeGuards';

const SERPER_RESOLVE_URL = 'https://google.serper.dev/resolve';
// Serper waits for Google on our behalf, so one call can take about 30 seconds
const REQUEST_TIMEOUT_MS = 30000;
// First try plus one more
const MAX_ATTEMPTS = 2;
// Upper bound on the pause Serper asks for with retryAfter
const MAX_RETRY_AFTER_SECONDS = 60;
const GOOGLE_HOST = /^(www\.)?google\.[a-z.]{2,6}$/i;

/** True for Google redirect links such as https://www.google.com/goto?url=CAES... or /url?q=... */
export const isGoogleRedirectUrl = (value: string | undefined | null): boolean => {
   if (!value) { return false; }
   try {
      const parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) && GOOGLE_HOST.test(parsed.hostname)
         && (parsed.pathname === '/goto' || parsed.pathname === '/url');
   } catch (_error) {
      return false;
   }
};

const isRealUrl = (value: unknown): value is string => (
   typeof value === 'string' && /^https?:\/\//i.test(value) && !isGoogleRedirectUrl(value)
);

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Replaces Google redirect links (google.com/goto?url=...) with the real address using Serper's free /resolve
 * endpoint. Needs SERPER_API_KEY; without it the items are returned unchanged. Items that are not Google redirect
 * links are never sent. A call can take up to about 30 seconds, so each one has a 30 second timeout. Each link gets
 * at most two lookups: a call that fails or times out is tried once more, and links that come back unresolved are
 * sent once more, after waiting the retryAfter seconds Serper reports (retrying sooner only delays them).
 * Anything still unresolved is left as the Google link.
 */
export const resolveGoogleRedirects = async <T extends { title?: string, url?: string }>(
   items: T[],
   apiKey: string | undefined = process.env.SERPER_API_KEY,
): Promise<T[]> => {
   let remaining = items.map((item, index) => (isGoogleRedirectUrl(item.url) ? index : -1)).filter((index) => index >= 0);
   const key = (apiKey || '').trim();
   if (remaining.length === 0 || !key) { return items; }

   const total = remaining.length;
   const resolved = [...items];
   let waitSeconds = 0;

   for (let attempt = 1; attempt <= MAX_ATTEMPTS && remaining.length > 0; attempt += 1) {
      if (attempt > 1 && waitSeconds > 0) {
         await sleep(Math.min(waitSeconds, MAX_RETRY_AFTER_SECONDS) * 1000);
      }
      waitSeconds = 0;
      const pending = remaining;
      try {
         const response = await fetch(SERPER_RESOLVE_URL, {
            method: 'POST',
            headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ organic: pending.map((index) => ({ title: items[index].title ?? '', link: items[index].url })) }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
         });
         if (!response.ok) {
            logger.debug('[SCRAPER] Serper link resolve failed', { status: response.status, attempt });
            continue;
         }

         const data: unknown = await response.json();
         const organic = asRecordArray(getPathValue(data, 'organic'));
         if (organic.length !== pending.length) {
            logger.debug('[SCRAPER] Serper link resolve returned an unexpected list', { sent: pending.length, received: organic.length, attempt });
            continue;
         }

         const stillUnresolved: number[] = [];
         pending.forEach((itemIndex, position) => {
            const link = organic[position]?.link;
            if (isRealUrl(link)) {
               resolved[itemIndex] = { ...items[itemIndex], url: link };
            } else {
               stillUnresolved.push(itemIndex);
            }
         });
         remaining = stillUnresolved;
         const retryAfter = Number(getPathValue(data, 'retryAfter'));
         waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0;
      } catch (error) {
         logger.debug('[SCRAPER] Serper link resolve request failed', { error: getUnknownErrorMessage(error) ?? '', attempt });
      }
   }

   if (remaining.length > 0) {
      logger.warn('[SCRAPE] Google links left unresolved', { unresolved: remaining.length, total });
   } else {
      logger.debug('[SCRAPER] Resolved Google links', { total });
   }
   return resolved;
};
