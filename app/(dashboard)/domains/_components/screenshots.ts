type ThumbEntry = { data: string; ts: number };

const STORAGE_KEY = 'domainThumbs';
const THUMB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isThumbEntry = (value: unknown): value is ThumbEntry => (
   typeof value === 'object' && value !== null && !Array.isArray(value)
   && typeof (value as ThumbEntry).data === 'string'
   && typeof (value as ThumbEntry).ts === 'number'
);

const readCache = (): Record<string, ThumbEntry> => {
   try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) { return {}; }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.values(parsed).every(isThumbEntry)) {
         return parsed as Record<string, ThumbEntry>;
      }
      window.localStorage.removeItem(STORAGE_KEY);
   } catch (_error) {
      // Unparseable or blocked storage: clear it and start from an empty cache.
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_removeError) { /* storage blocked */ }
   }
   return {};
};

/**
 * Returns a cached website screenshot (data URL) for the domain, fetching a new one when the cache is older than seven days
 * or `forceFetch` is set. Same cache key and lifetime as the legacy screen, so existing thumbnails keep working.
 * Returns false when no screenshot is available.
 */
export async function fetchDomainScreenshot(domain: string, forceFetch = false): Promise<string | false> {
   if (typeof window === 'undefined') { return false; }
   const cache = readCache();
   const existing = cache[domain];
   if (existing && !forceFetch && Date.now() - existing.ts < THUMB_TTL_MS) { return existing.data; }

   try {
      const response = await fetch(`https://image.thum.io/get/maxAge/168/width/200/https://${domain}`);
      if (response.status !== 200) { return false; }
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
         reader.onerror = () => reject(reader.error);
         reader.readAsDataURL(blob);
      });
      if (!data) { return false; }
      cache[domain] = { data, ts: Date.now() };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch (_error) { /* storage full or blocked */ }
      return data;
   } catch (_error) {
      return false;
   }
}
