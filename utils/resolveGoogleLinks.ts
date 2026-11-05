import { logger } from './logger';

const SERPER_RESOLVE_URL = 'https://google.serper.dev/resolve';
// Serper waits for Google on our behalf, which can take about 30 seconds right after a search
const REQUEST_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 2;
const MAX_RETRY_WAIT_SECONDS = 45;
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
 * links are never sent. Links Serper cannot resolve yet are retried once after the wait it asks for, then left as
 * they were.
 */
export const resolveGoogleRedirects = async <T extends { title?: string, url?: string }>(
   items: T[],
   apiKey: string | undefined = process.env.SERPER_API_KEY,
): Promise<T[]> => {
   const pending = items.map((item, index) => (isGoogleRedirectUrl(item.url) ? index : -1)).filter((index) => index >= 0);
   const key = (apiKey || '').trim();
   if (pending.length === 0 || !key) { return items; }

   const resolved = [...items];
   let remaining = pending;

   for (let attempt = 1; attempt <= MAX_ATTEMPTS && remaining.length > 0; attempt += 1) {
      try {
         const response = await fetch(SERPER_RESOLVE_URL, {
            method: 'POST',
            headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ organic: remaining.map((index) => ({ title: items[index].title ?? '', link: items[index].url })) }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
         });
         if (!response.ok) {
            logger.warn('[SCRAPE] Serper link resolve failed, keeping Google links', { status: response.status });
            return resolved;
         }

         const data: any = await response.json();
         const organic: any[] = Array.isArray(data?.organic) ? data.organic : [];
         if (organic.length !== remaining.length) {
            logger.warn('[SCRAPE] Serper link resolve returned an unexpected list, keeping Google links', { sent: remaining.length, received: organic.length });
            return resolved;
         }

         const stillPending: number[] = [];
         remaining.forEach((itemIndex, position) => {
            const link = organic[position]?.link;
            if (isRealUrl(link)) {
               resolved[itemIndex] = { ...items[itemIndex], url: link };
            } else {
               stillPending.push(itemIndex);
            }
         });
         remaining = stillPending;

         const retryAfter = Number(data?.retryAfter);
         if (remaining.length > 0 && attempt < MAX_ATTEMPTS && retryAfter > 0) {
            await sleep(Math.min(retryAfter, MAX_RETRY_WAIT_SECONDS) * 1000);
         } else {
            break;
         }
      } catch (error: any) {
         logger.warn('[SCRAPE] Serper link resolve request failed, keeping Google links', { error: error?.message || '' });
         return resolved;
      }
   }

   if (remaining.length > 0) {
      logger.warn('[SCRAPE] Google links left unresolved', { unresolved: remaining.length, total: pending.length });
   } else {
      logger.info('[SCRAPE] Resolved Google links', { total: pending.length });
   }
   return resolved;
};
