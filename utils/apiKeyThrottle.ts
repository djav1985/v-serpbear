import type { NextApiRequest } from 'next';
import { AttemptKey } from './loginThrottle';
import { getClientIp } from './api/clientIp';

/** Failed API-key attempts allowed per client address before it is locked for 15 minutes. */
export const API_KEY_MAX_FAILURES = 5;

/** Throttle key for failed Bearer attempts from this request's client address (shares utils/loginThrottle). */
export const getApiKeyAttemptKeys = (req: NextApiRequest): AttemptKey[] => [
   { key: `apikey:${getClientIp(req)}`, maxFailures: API_KEY_MAX_FAILURES },
];
