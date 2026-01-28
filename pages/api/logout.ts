/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Cookies from 'cookies';
import verifyUser from '../../utils/verifyUser';
import { withApiLogging } from '../../utils/apiLogging';
import { logger } from '../../utils/logger';
import isRequestSecure from '../../utils/api/isRequestSecure';

type logoutResponse = {
   success?: boolean
   error?: string|null,
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   const startTime = Date.now();
   
   logger.info('Logout API endpoint accessed', {
      method: req.method,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent']
   });

   if (req.method !== 'POST') {
      logger.warn('Invalid method used for logout endpoint', {
         method: req.method,
         duration: Date.now() - startTime
      });
      return res.status(405).json({ success: false, error: 'Method not allowed' });
   }

   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      logger.warn('Logout attempt by unauthenticated user', {
         reason: authorized,
         duration: Date.now() - startTime
      });
      return res.status(401).json({ error: authorized });
   }

   return logout(req, res, startTime);
};

const logout = async (req: NextApiRequest, res: NextApiResponse<logoutResponse>, startTime: number) => {
   try {
      const secureCookie = isRequestSecure(req);
      const cookies = new Cookies(req, res, { secure: secureCookie });

      // Get user info before clearing token for logging
      let username = 'unknown_user';
      try {
         const jwt = await import('jsonwebtoken');
         const token = cookies.get('token');
          if (token && process.env.SECRET) {
             const decoded = jwt.verify(token, process.env.SECRET) as ApiUserPayload | string;
             if (decoded && typeof decoded === 'object') {
                const decodedUser = decoded.user;
                if (typeof decodedUser === 'string') {
                   username = decodedUser;
                }
             }
          }
      } catch (error) {
         logger.debug('Failed to decode logout token during logout', error instanceof Error ? error : new Error(String(error)));
      }

      // Clear the token cookie
      cookies.set('token', '', {
         httpOnly: true,
         sameSite: 'lax',
         maxAge: 0,
         expires: new Date(0),
         path: '/',
         secure: secureCookie,
      });

      logger.info('User logged out successfully', {
         username,
         duration: Date.now() - startTime,
         ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
      });

      return res.status(200).json({ success: true, error: null });
   } catch (error) {
      logger.error('Logout failed with exception', error instanceof Error ? error : new Error(String(error)), {
         duration: Date.now() - startTime
      });
      return res.status(500).json({ success: false, error: 'Internal server error' });
   }
};

export default withApiLogging(handler, {
   name: 'logout',
   logBody: false,
});
