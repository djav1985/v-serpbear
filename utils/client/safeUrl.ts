/**
 * Returns the URL when it is a valid http(s) URL, otherwise an empty string.
 * Use it for hrefs built from scraper or Ads data so values like "javascript:..." never become links.
 */
export const safeHttpUrl = (value?: string | null): string => {
   if (typeof value !== 'string') { return ''; }
   const trimmed = value.trim();
   if (!trimmed) { return ''; }
   try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : '';
   } catch (_error) {
      return '';
   }
};
