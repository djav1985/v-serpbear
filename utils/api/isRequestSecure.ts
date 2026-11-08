import { trustedProxyHops } from './clientIp';

/** True when a forwarded protocol header says the client used HTTPS. Only consulted when TRUST_PROXY is set. */
const forwardedProtocolIsHttps = (req: Request): boolean => {
   const protoHeader = req.headers.get('x-forwarded-proto');
   if (protoHeader) {
      // Comma-delimited values come from multi-proxy deployments
      const protocols = protoHeader.split(',').map((p) => p.trim().toLowerCase());
      if (protocols.includes('https')) { return true; }
   }

   if (req.headers.get('x-forwarded-protocol')?.toLowerCase() === 'https') { return true; }
   if (req.headers.get('x-forwarded-ssl')?.toLowerCase() === 'on') { return true; }
   return false;
};

/**
 * Whether the client reached the app over HTTPS, used for the Secure cookie flag. Forwarded protocol headers are
 * client-supplied, so they count only when TRUST_PROXY names our reverse proxies. Otherwise only the request URL counts.
 */
const isRequestSecure = (req: Request): boolean => {
   if (trustedProxyHops() > 0 && forwardedProtocolIsHttps(req)) { return true; }
   try {
      return new URL(req.url).protocol === 'https:';
   } catch (_error) {
      return false;
   }
};

export default isRequestSecure;
