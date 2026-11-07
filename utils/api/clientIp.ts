import type { NextApiRequest } from 'next';
import { isIP } from 'net';
import { logger } from '../logger';

/**
 * Number of reverse proxies in front of the app that append to X-Forwarded-For.
 * Unset or 0 means none: the socket address is the client. "true" means one proxy.
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

let warnedAboutProxy = false;

/**
 * A request that carries X-Forwarded-For while TRUST_PROXY is unset most likely comes through a reverse proxy. Every
 * visitor then shares the proxy's address, so failed logins from anyone count against one lockout key and can lock
 * the owner out. Logged once per process.
 */
const warnAboutUntrustedProxyHeader = (req: NextApiRequest): void => {
   if (warnedAboutProxy || !req.headers?.['x-forwarded-for']) { return; }
   warnedAboutProxy = true;
   logger.warn('Requests carry X-Forwarded-For but TRUST_PROXY is not set. Every visitor shares the proxy address, so login and API key lockouts apply to everyone at once. Set TRUST_PROXY to the number of reverse proxies in front of the app (usually 1).');
};

/** Test helper: allow the proxy warning to be logged again. */
export const resetProxyWarning = (): void => {
   warnedAboutProxy = false;
};

/**
 * The address of the client making the request, used as a rate-limit and lockout key.
 * Behind a proxy (TRUST_PROXY=<hops>), reads the entry that many places from the right of X-Forwarded-For;
 * otherwise, or when that entry is not a valid IP, uses the socket address.
 */
export const getClientIp = (req: NextApiRequest): string => {
   const socketAddress = req.socket?.remoteAddress || 'unknown';
   const hops = trustedProxyHops();
   if (hops === 0) {
      warnAboutUntrustedProxyHeader(req);
      return socketAddress;
   }

   const header = req.headers?.['x-forwarded-for'];
   const raw = Array.isArray(header) ? header.join(',') : header;
   if (!raw) { return socketAddress; }

   const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
   const candidate = entries[entries.length - hops];
   return candidate && isIP(candidate) ? candidate : socketAddress;
};
