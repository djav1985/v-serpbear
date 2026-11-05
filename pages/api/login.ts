/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../utils/logger';
import isRequestSecure from '../../utils/api/isRequestSecure';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';
import { AttemptKey, clearLoginFailures, isLoginLocked, recordLoginFailure } from '../../utils/loginThrottle';
import { getSessionVersion } from '../../utils/sessionStore';
import { getClientIp } from '../../utils/api/clientIp';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const startTime = Date.now();
   
   logger.info('Login API endpoint accessed', {
      method: req.method,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
   });

   if (req.method === 'POST') {
      return loginUser(req, res, startTime);
   }
   
   logger.warn('Invalid method used for login endpoint', {
      method: req.method,
      duration: Date.now() - startTime
   });
   
   return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
}

const loginUser = async (req: NextApiRequest, res: NextApiResponse, startTime: number) => {
   const requestId = (req as ExtendedRequest).requestId;
   if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json(errorResponse('BAD_REQUEST', 'Request body must be a JSON object', requestId));
   }
   const { username, password } = req.body;
   
   logger.info('Login attempt started', {
      hasUsername: typeof username === 'string' && username.length > 0,
      hasPassword: !!password,
      ip: getClientIp(req)
   });

   const MAX_CREDENTIAL_LENGTH = 1024;
   if (typeof username !== 'string' || typeof password !== 'string'
      || username.length === 0 || password.length === 0
      || username.length > MAX_CREDENTIAL_LENGTH || password.length > MAX_CREDENTIAL_LENGTH) {
      const error = 'Username Password Missing';
      logger.warn('Login failed: missing credentials', {
         hasUsername: !!username,
         hasPassword: !!password,
         duration: Date.now() - startTime
      });
      return res.status(401).json(errorResponse('MISSING_CREDENTIALS', error, requestId));
   }

   // Limit guesses without letting a stranger lock the real user out:
   //  - the user's own lockout (5 failures) is per client address, so one address cannot block the others
   //  - a higher per-user cap bounds guessing spread over many addresses; it only turns away requests whose
   //    credentials are wrong, so strangers filling it cannot lock out the correct password
   //  - a per-address cap bounds one address trying many usernames
   // Names that are not the configured user share one bucket, so made-up usernames cannot grow the tracked set.
   // The address is the socket address, or the X-Forwarded-For entry selected by TRUST_PROXY (see utils/api/clientIp).
   const clientIp = getClientIp(req);
   const configuredUser = (process.env.USER_NAME ? process.env.USER_NAME : process.env.USER) || '';
   const knownUser = configuredUser !== '' && username.toLowerCase() === configuredUser.toLowerCase();
   const userWideKey: AttemptKey = knownUser
      ? { key: `user:${configuredUser.toLowerCase()}`, maxFailures: 100 }
      : { key: 'user:unknown', maxFailures: 200 };
   const addressKeys: AttemptKey[] = knownUser
      ? [
         { key: `user:${configuredUser.toLowerCase()}@${clientIp}`, maxFailures: 5 },
         { key: `ip:${clientIp}`, maxFailures: 20 },
      ]
      : [{ key: `ip:${clientIp}`, maxFailures: 20 }];
   const attemptKeys: AttemptKey[] = [...addressKeys, userWideKey];
   if (isLoginLocked(addressKeys)) {
      logger.warn('Login blocked: too many failed attempts', { duration: Date.now() - startTime });
      return res.status(429).json(errorResponse('TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again in 15 minutes.', requestId));
   }

   const userName = process.env.USER_NAME ? process.env.USER_NAME : process.env.USER;

   // Enhanced environment validation
   if (!userName) {
      logger.error('Login configuration error: USER/USER_NAME not set in environment variables');
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Server configuration error', requestId));
   }
   
   if (!process.env.PASSWORD) {
      logger.error('Login configuration error: PASSWORD not set in environment variables');
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Server configuration error', requestId));
   }
   
   if (!process.env.SECRET) {
      logger.error('Login configuration error: SECRET not set in environment variables');
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Server configuration error', requestId));
   }

   // Use timing-safe comparison to prevent timing attacks
   let isUsernameValid = false;
   let isPasswordValid = false;
   
   try {
      const safeCompare = (left: string, right: string): boolean => {
         const leftBuffer = Buffer.from(left, 'utf8');
         const rightBuffer = Buffer.from(right, 'utf8');
         const comparisonLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
         const paddedLeft = Buffer.alloc(comparisonLength);
         const paddedRight = Buffer.alloc(comparisonLength);
         leftBuffer.copy(paddedLeft);
         rightBuffer.copy(paddedRight);
         return timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length;
      };
      isUsernameValid = safeCompare(userName, username);
      isPasswordValid = safeCompare(process.env.PASSWORD, password);
   } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(
         'Login failed: timing-safe comparison error',
         err,
         {
            duration: Date.now() - startTime,
            ip: getClientIp(req)
         }
      );
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Internal server error', requestId));
   }

   if (isUsernameValid && isPasswordValid) {
      try {
         const parsedDuration = Number.parseInt(process.env.SESSION_DURATION ?? '', 10);
         const sessionDurationHours = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 24;
         const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
         const expiryDate = new Date(Date.now() + sessionDurationMs);
         // The token expires with the cookie, so a copied token stops working after the session window.
         // The session version lets logout revoke this token (see utils/sessionStore)
         const token = jwt.sign({ user: userName, sv: getSessionVersion() }, process.env.SECRET, { expiresIn: sessionDurationHours * 60 * 60 });
         const secureCookie = isRequestSecure(req);
         const cookies = new Cookies(req, res, { secure: secureCookie });

         cookies.set('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionDurationMs,
            expires: expiryDate,
            secure: secureCookie,
            path: '/',
         });

         clearLoginFailures(attemptKeys);

         logger.info('Login successful', {
            sessionDuration: sessionDurationHours,
            expiresAt: expiryDate.toISOString(),
            duration: Date.now() - startTime,
            ip: getClientIp(req)
         });

         return res.status(200).json({ success: true });
      } catch (error) {
         logger.error('Login failed: JWT token generation error', error instanceof Error ? error : new Error(String(error)), {
            username: userName,
            duration: Date.now() - startTime
         });
         return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Internal server error', requestId));
      }
   }

   // Wrong credentials while the user-wide cap is reached are refused without further counting
   if (isLoginLocked([userWideKey])) {
      logger.warn('Login blocked: too many failed attempts for this user', { duration: Date.now() - startTime });
      return res.status(429).json(errorResponse('TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again in 15 minutes.', requestId));
   }

   recordLoginFailure(attemptKeys);

   // Generic error message to prevent username enumeration
   const error = 'Invalid credentials';
   
   logger.warn('Login failed: invalid credentials', {
      duration: Date.now() - startTime,
      ip: getClientIp(req)
   });

   return res.status(401).json(errorResponse('INVALID_CREDENTIALS', error, requestId));
};

export default withApiLogging(handler, { name: 'login' });
