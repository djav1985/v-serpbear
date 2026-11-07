import type { NextApiRequest, NextApiResponse } from 'next';
import Cookies from 'cookies';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { logger } from './logger';
import { getSessionVersion } from './sessionStore';
import { redactUrl } from './logRedaction';
import { clearLoginFailures, recordLoginFailure } from './loginThrottle';
import { getApiKeyAttemptKeys } from './apiKeyThrottle';

/**
 * Compares two secrets in constant time. Returns false when either side is missing.
 */
const safeEqual = (candidate: string, expected: string | undefined): boolean => {
   if (!expected) { return false; }
   const candidateBuffer = Buffer.from(candidate, 'utf8');
   const expectedBuffer = Buffer.from(expected, 'utf8');
   if (candidateBuffer.length !== expectedBuffer.length) { return false; }
   return timingSafeEqual(candidateBuffer, expectedBuffer);
};

/**
 * Verifies a login token: signature, expiry and the session version (a token issued before the last
 * logout carries an older version and is rejected; a missing version counts as 0).
 * Throws when the token is not valid. Use this everywhere a cookie token is checked, so a revoked
 * token is rejected on every route.
 */
export const verifySessionToken = (token: string): JwtDecodedPayload => {
   if (!process.env.SECRET) {
      throw new Error('JWT SECRET not configured');
   }
   const decoded = jwt.verify(token, process.env.SECRET) as JwtDecodedPayload;
   const tokenVersion = Number((decoded as { sv?: unknown })?.sv ?? 0);
   if (tokenVersion !== getSessionVersion()) {
      throw new Error('Session has been revoked');
   }
   return decoded;
};

/** True when the Authorization header uses the Bearer scheme (other schemes, such as Basic, are not API-key attempts). */
export const isBearerAuthorization = (header: string | undefined): boolean => typeof header === 'string' && header.startsWith('Bearer ');

/** True when the request carries a login cookie with a valid signature, expiry and session version. */
export const hasValidSessionCookie = (req: NextApiRequest, res: NextApiResponse): boolean => {
   try {
      const token = new Cookies(req, res).get('token');
      if (!token || !process.env.SECRET) { return false; }
      verifySessionToken(token);
      return true;
   } catch (_error) {
      return false;
   }
};

/**
 * Checks `Authorization: Bearer <APIKEY>` in constant time. This is the only place the API key is compared.
 * Cookies are never looked at. A wrong Bearer key is recorded against the client address (withApiLogging answers
 * 429 once the limit is reached) and a right one clears that record. Other schemes, such as Basic, are not API-key
 * attempts and are ignored. `shouldCountFailure` can veto counting a wrong key (verifyUser skips it for requests
 * with a valid login cookie).
 */
export const checkApiKey = (req: NextApiRequest, shouldCountFailure: () => boolean = () => true): boolean => {
   const header = req.headers.authorization;
   if (!isBearerAuthorization(header)) { return false; }
   const verified = safeEqual((header as string).substring('Bearer '.length), process.env.APIKEY);
   const attemptKeys = getApiKeyAttemptKeys(req);
   if (verified) {
      clearLoginFailures(attemptKeys);
   } else if (shouldCountFailure()) {
      recordLoginFailure(attemptKeys);
   }
   return verified;
};

/**
 * Psuedo Middleware: Verifies the user by their cookie value or their API Key
 * When accessing with API key only certain routes are accessible.
 * @param {NextApiRequest} req - The Next Request
 * @param {NextApiResponse} res - The Next Response.
 * @returns {string}
 */
const verifyUser = (req: NextApiRequest, res: NextApiResponse): string => {
   const startTime = Date.now();
   const cookies = new Cookies(req, res);
   const token = cookies && cookies.get('token');

   const allowedApiRoutes = [
      'GET:/api/keyword',
      'GET:/api/keywords',
      'GET:/api/domains',
      'POST:/api/refresh',
      'POST:/api/cron',
      'POST:/api/notify',
      'POST:/api/volume',
      'POST:/api/searchconsole',
      'GET:/api/searchconsole',
      'GET:/api/insight',
      'GET:/api/ideas',
      'POST:/api/ideas',
   ];
   
   // Wrong keys are not counted when the request also carries a valid login cookie
   const verifiedAPI = checkApiKey(req, () => !hasValidSessionCookie(req, res));

   // Compute normalized path once for all route checks
   const normalizedPath = req.url && req.method ? `${req.method}:${req.url.replace(/\?(.*)/, '')}` : '';
   const accessingAllowedRoute = normalizedPath && allowedApiRoutes.includes(normalizedPath);
   
   let authorized: string = '';
   let authMethod: string = 'none';
   let username: string | undefined;

   if (token && process.env.SECRET) {
      try {
         // Verify JWT token (including the session version) and extract user information
         const decoded = verifySessionToken(token);
         authorized = 'authorized';
         authMethod = 'jwt_token';
         username = decoded?.user;
         logger.authEvent('token_verification_success', username, true);
      } catch (err: any) {
         // JWT validation failed - try API key fallback before rejecting
         if (verifiedAPI && accessingAllowedRoute) {
            authorized = 'authorized';
            authMethod = 'api_key';
            logger.authEvent('api_key_verification_success_after_jwt_fail', 'api_user', true, {
               route: normalizedPath,
               jwtError: err?.message || String(err)
            });
         } else {
            authorized = 'Not authorized';
            logger.authEvent('token_verification_failed', undefined, false, {
               error: err?.message || String(err),
               tokenPresent: true
            });
         }
      }
   } else if (verifiedAPI && accessingAllowedRoute) {
      authorized = 'authorized';
      authMethod = 'api_key';
      logger.authEvent('api_key_verification_success', 'api_user', true, {
         route: normalizedPath
      });
   } else {
      if (!token) {
         authorized = 'Not authorized';
         logger.authEvent('no_token_provided', undefined, false);
      }
      if (token && !process.env.SECRET) {
         authorized = 'Token has not been Setup.';
         logger.error('JWT SECRET not configured in environment variables');
      }
      if (verifiedAPI && !accessingAllowedRoute) {
         authorized = 'This Route cannot be accessed with API.';
         logger.authEvent('api_route_not_allowed', 'api_user', false, {
            route: normalizedPath
         });
      }
      if (req.headers.authorization && !verifiedAPI) {
         authorized = 'Invalid API Key Provided.';
         logger.authEvent('invalid_api_key', undefined, false);
      }
   }

   const duration = Date.now() - startTime;
   
   // Log the final authentication result
   if (authorized === 'authorized') {
      logger.debug('Authentication successful', {
         method: req.method,
         url: redactUrl(req.url),
         authMethod,
         username,
         duration
      });
   } else {
      logger.warn('Authentication failed', {
         method: req.method,
         url: redactUrl(req.url),
         reason: authorized,
         duration
      });
   }

   return authorized;
};

export default verifyUser;
