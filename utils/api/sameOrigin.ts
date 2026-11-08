/**
 * The origins this app is served from: the request's own URL, the Host the client used (through a proxy, the
 * forwarded host and protocol), and NEXT_PUBLIC_APP_URL.
 */
const ownOrigins = (req: Request): string[] => {
   const origins = new Set<string>();
   let protocol = 'http';
   try {
      const url = new URL(req.url);
      origins.add(url.origin);
      protocol = url.protocol.replace(/:$/, '');
   } catch (_error) {
      // A request URL that does not parse adds nothing to the list
   }
   const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
   if (host) {
      const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
      origins.add(`${forwardedProto || protocol}://${host}`);
   }
   const appUrl = process.env.NEXT_PUBLIC_APP_URL;
   if (appUrl) {
      try {
         origins.add(new URL(appUrl).origin);
      } catch (_error) {
         // An invalid NEXT_PUBLIC_APP_URL is ignored here
      }
   }
   return [...origins];
};

/**
 * True when a request was made by this site's own pages. Used for requests that a logged-in browser can send and
 * that start paid work: a page on another site cannot make the browser send them. Browsers report the origin of a
 * request (Origin, Sec-Fetch-Site); a request that reports neither is from a non-browser client, which is not a
 * cross-site browser request.
 */
export const isSameOriginRequest = (req: Request): boolean => {
   const fetchSite = req.headers.get('sec-fetch-site');
   if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') { return false; }
   const origin = req.headers.get('origin');
   if (!origin) { return true; }
   return ownOrigins(req).includes(origin);
};
