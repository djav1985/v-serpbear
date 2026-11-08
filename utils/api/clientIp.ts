import { isIP } from 'net';

/**
 * Number of reverse proxies in front of the app that append to X-Forwarded-For.
 * Unset or 0 means none. "true" means one proxy.
 * A forwarded header is only trusted for the hops that are configured, because a client can put anything
 * in the part of the header that comes before the entries our own proxies added.
 */
export const trustedProxyHops = (): number => {
   const raw = (process.env.TRUST_PROXY || '').trim().toLowerCase();
   if (!raw || raw === 'false' || raw === '0') { return 0; }
   if (raw === 'true') { return 1; }
   const hops = Number.parseInt(raw, 10);
   return Number.isInteger(hops) && hops > 0 ? Math.min(hops, 10) : 0;
};

/**
 * The address of the client making the request, used as a rate-limit and lockout key.
 * Route handlers cannot see the socket, and Next keeps a client-supplied X-Forwarded-For as it is, so the header is
 * only trusted behind a proxy that is configured with TRUST_PROXY=<hops>: the entry that many places from the right.
 * Without it every request shares one address ("unknown"), so a lockout is shared too. Set TRUST_PROXY when the app
 * sits behind a reverse proxy to get per-client limits.
 */
export const getClientIp = (req: Request): string => {
   const hops = trustedProxyHops();
   if (hops === 0) { return 'unknown'; }

   const raw = req.headers.get('x-forwarded-for');
   if (!raw) { return 'unknown'; }

   const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
   const candidate = entries[entries.length - hops];
   return candidate && isIP(candidate) ? candidate : 'unknown';
};
