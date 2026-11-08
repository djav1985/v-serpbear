import { AttemptKey } from './loginThrottle';
import { getClientIp } from './api/clientIp';

/** Failed API-key attempts allowed per client address before it is locked for 15 minutes. */
export const API_KEY_MAX_FAILURES = 5;

/**
 * Failed API-key attempts allowed from all clients together when no address is known (TRUST_PROXY unset).
 * While it is reached, wrong keys are refused; the correct key is still accepted (see run() in utils/apiLogging).
 */
export const API_KEY_UNKNOWN_CLIENT_MAX_FAILURES = 100;

/** Throttle key for failed Bearer attempts from this request's client address (shares utils/loginThrottle). */
export const getApiKeyAttemptKeys = (req: Request): AttemptKey[] => {
   const clientIp = getClientIp(req);
   return clientIp === 'unknown'
      ? [{ key: 'apikey:unknown', maxFailures: API_KEY_UNKNOWN_CLIENT_MAX_FAILURES }]
      : [{ key: `apikey:${clientIp}`, maxFailures: API_KEY_MAX_FAILURES }];
};
