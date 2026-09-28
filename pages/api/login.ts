/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../utils/logger';
import isRequestSecure from '../../utils/api/isRequestSecure';
import { withApiLogging } from '../../utils/apiLogging';
import { errorResponse } from '../../utils/api/response';

async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const startTime = Date.now();
   
   logger.info('Login API endpoint accessed', {
      method: req.method,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
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
   const { username, password } = req.body;
   
   logger.info('Login attempt started', {
      username: username || 'not_provided',
      hasPassword: !!password,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
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
            username,
            duration: Date.now() - startTime,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
         }
      );
      return res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Internal server error', requestId));
   }

   if (isUsernameValid && isPasswordValid) {
      try {
         const token = jwt.sign({ user: userName }, process.env.SECRET);
         const secureCookie = isRequestSecure(req);
         const cookies = new Cookies(req, res, { secure: secureCookie });
         const parsedDuration = Number.parseInt(process.env.SESSION_DURATION ?? '', 10);
         const sessionDurationHours = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 24;
         const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
         const expiryDate = new Date(Date.now() + sessionDurationMs);

         cookies.set('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionDurationMs,
            expires: expiryDate,
            secure: secureCookie,
            path: '/',
         });

         logger.info('Login successful', {
            username: userName,
            sessionDuration: sessionDurationHours,
            expiresAt: expiryDate.toISOString(),
            duration: Date.now() - startTime,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
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

   // Generic error message to prevent username enumeration
   const error = 'Invalid credentials';
   
   logger.warn('Login failed: invalid credentials', {
      username,
      duration: Date.now() - startTime,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
   });

   return res.status(401).json(errorResponse('INVALID_CREDENTIALS', error, requestId));
};

export default withApiLogging(handler, { name: 'login' });
