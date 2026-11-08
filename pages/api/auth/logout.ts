/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Cookies from 'cookies';
import verifyUser from '../../../utils/verifyUser';
import { withApiLogging } from '../../../utils/apiLogging';
import { logger } from '../../../utils/logger';
import { getClientIp } from '../../../utils/api/clientIp';
import isRequestSecure from '../../../utils/api/isRequestSecure';
import { errorResponse } from '../../../utils/api/response';
import { revokeAllSessions } from '../../../utils/sessionStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   const requestId = (req as ExtendedRequest).requestId;
   const startTime = Date.now();
   
   logger.debug('[API] Logout API endpoint accessed', {
      method: req.method,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent']
   });

   if (req.method !== 'POST') {
      logger.debug('[API] Invalid method used for logout endpoint', {
         method: req.method,
         duration: Date.now() - startTime
      });
      return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
   }

   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      logger.debug('[API] Logout attempt by unauthenticated user', {
         reason: authorized,
         duration: Date.now() - startTime
      });
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }

   return logout(req, res, startTime);
};

const logout = async (req: NextApiRequest, res: NextApiResponse, startTime: number) => {
   const requestId = (req as ExtendedRequest).requestId;
   try {
      const secureCookie = isRequestSecure(req);
      const cookies = new Cookies(req, res, { secure: secureCookie });

      // Get user info before clearing token for logging
      let username = 'unknown_user';
      try {
         const jwt = await import('jsonwebtoken');
         const token = cookies.get('token');
         if (token && process.env.SECRET) {
            const decoded = jwt.verify(token, process.env.SECRET) as JwtDecodedPayload;
            username = decoded?.user || username;
         }
      } catch (error) {
         logger.debug('[API] Failed to decode logout token during logout', { error: error instanceof Error ? error.message : String(error) });
      }

      // Revoke every issued token, including copies taken before logout, then clear the cookie
      await revokeAllSessions();

      cookies.set('token', '', {
         httpOnly: true,
         sameSite: 'lax',
         maxAge: 0,
         expires: new Date(0),
         path: '/',
         secure: secureCookie,
      });

      logger.debug('[API] User logged out successfully', {
         username,
         duration: Date.now() - startTime,
         ip: getClientIp(req)
      });

      return res.status(200).json({ success: true });
   } catch (error) {
      logger.error('Logout failed with exception', error instanceof Error ? error : new Error(String(error)), {
         duration: Date.now() - startTime
      });
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Internal server error', requestId));
   }
};

export default withApiLogging(handler, {
   name: 'logout',
});
