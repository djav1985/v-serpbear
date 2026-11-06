import type { NextApiRequest } from 'next';
import { trustedProxyHops } from './clientIp';

/** True when a forwarded protocol header says the client used HTTPS. Only consulted when TRUST_PROXY is set. */
const forwardedProtocolIsHttps = (req: NextApiRequest): boolean => {
   const protoHeader = req.headers['x-forwarded-proto'];
   if (Array.isArray(protoHeader)) {
      if (protoHeader.some((value) => value?.toLowerCase() === 'https')) {
         return true;
      }
   } else if (typeof protoHeader === 'string') {
      // Split on commas to handle comma-delimited values from multi-proxy deployments
      const protocols = protoHeader.split(',').map((p) => p.trim().toLowerCase());
      if (protocols.includes('https')) {
         return true;
      }
   }

   const forwardedProtocol = req.headers['x-forwarded-protocol'];
   if (typeof forwardedProtocol === 'string' && forwardedProtocol.toLowerCase() === 'https') {
      return true;
   }

   const forwardedSsl = req.headers['x-forwarded-ssl'];
   if (typeof forwardedSsl === 'string' && forwardedSsl.toLowerCase() === 'on') {
      return true;
   }

   return false;
};

/**
 * Whether the client reached the app over HTTPS, used for the Secure cookie flag. Forwarded protocol headers are
 * client-supplied, so they count only when TRUST_PROXY names our reverse proxies. Otherwise only the socket's TLS state counts.
 */
const isRequestSecure = (req: NextApiRequest): boolean => {
   if (trustedProxyHops() > 0 && forwardedProtocolIsHttps(req)) {
      return true;
   }
   const socket = req.socket as { encrypted?: boolean } | undefined;
   return socket?.encrypted === true;
};

export default isRequestSecure;
