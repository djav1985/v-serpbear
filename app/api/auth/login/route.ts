import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../../../utils/logger';
import isRequestSecure from '../../../../utils/api/isRequestSecure';
import { createRoute, fail, json, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { serializeCookie } from '../../../../utils/api/cookies';
import { AttemptKey, clearLoginFailures, isLoginLocked, recordLoginFailure } from '../../../../utils/loginThrottle';
import { getSessionVersion } from '../../../../utils/sessionStore';
import { getClientIp } from '../../../../utils/api/clientIp';

const loginUser = async (req: Request, ctx: ApiContext) => {
   const startTime = Date.now();
   logger.debug('[API] Login API endpoint accessed', {
      method: req.method,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
   });
   const body = await readJson(req);
   if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object', ctx);
   }
   const { username, password } = body as { username?: unknown; password?: unknown };
   
   logger.debug('[API] Login attempt started', {
      hasUsername: typeof username === 'string' && username.length > 0,
      hasPassword: !!password,
      ip: getClientIp(req)
   });

   const MAX_CREDENTIAL_LENGTH = 1024;
   if (typeof username !== 'string' || typeof password !== 'string'
      || username.length === 0 || password.length === 0
      || username.length > MAX_CREDENTIAL_LENGTH || password.length > MAX_CREDENTIAL_LENGTH) {
      const error = 'Username Password Missing';
      logger.debug('[API] Login failed: missing credentials', {
         hasUsername: !!username,
         hasPassword: !!password,
         duration: Date.now() - startTime
      });
      return fail(401, 'MISSING_CREDENTIALS', error, ctx);
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
      return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again in 15 minutes.', ctx);
   }

   const userName = process.env.USER_NAME ? process.env.USER_NAME : process.env.USER;

   // Enhanced environment validation
   if (!userName) {
      logger.error('Login configuration error: USER/USER_NAME not set in environment variables');
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error', ctx);
   }
   
   if (!process.env.PASSWORD) {
      logger.error('Login configuration error: PASSWORD not set in environment variables');
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error', ctx);
   }
   
   if (!process.env.SECRET) {
      logger.error('Login configuration error: SECRET not set in environment variables');
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Server configuration error', ctx);
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
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
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
         const sessionCookie = serializeCookie('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionDurationMs,
            expires: expiryDate,
            secure: secureCookie,
            path: '/',
         });

         clearLoginFailures(attemptKeys);

         logger.debug('[API] Login successful', {
            sessionDuration: sessionDurationHours,
            expiresAt: expiryDate.toISOString(),
            duration: Date.now() - startTime,
            ip: getClientIp(req)
         });

         return json({ success: true }, 200, { 'Set-Cookie': sessionCookie });
      } catch (error) {
         logger.error('Login failed: JWT token generation error', error instanceof Error ? error : new Error(String(error)), {
            username: userName,
            duration: Date.now() - startTime
         });
         return fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
      }
   }

   // Wrong credentials while the user-wide cap is reached are refused, but they still count against this
   // address's own limits, so the global cap cannot give one address unlimited guesses
   if (isLoginLocked([userWideKey])) {
      recordLoginFailure(addressKeys);
      logger.warn('Login blocked: too many failed attempts for this user', { duration: Date.now() - startTime });
      return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many failed login attempts. Try again in 15 minutes.', ctx);
   }

   recordLoginFailure(attemptKeys);

   // Generic error message to prevent username enumeration
   const error = 'Invalid credentials';
   
   logger.debug('[API] Login failed: invalid credentials', {
      duration: Date.now() - startTime,
      ip: getClientIp(req)
   });

   return fail(401, 'INVALID_CREDENTIALS', error, ctx);
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'login', auth: false, POST: loginUser });
