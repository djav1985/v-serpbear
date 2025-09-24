/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { logger } from '../../utils/logger';

type loginResponse = {
   success?: boolean
   error?: string|null,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
   
   return res.status(401).json({ success: false, error: 'Invalid Method' });
}

const loginUser = async (req: NextApiRequest, res: NextApiResponse<loginResponse>, startTime: number) => {
   const { username, password } = req.body;
   
   logger.info('Login attempt started', {
      username: username || 'not_provided',
      hasPassword: !!password,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
   });

   if (!username || !password) {
      const error = 'Username Password Missing';
      logger.warn('Login failed: missing credentials', {
         hasUsername: !!username,
         hasPassword: !!password,
         duration: Date.now() - startTime
      });
      return res.status(401).json({ error });
   }

   const userName = process.env.USER_NAME ? process.env.USER_NAME : process.env.USER;
   
   // Enhanced environment validation
   if (!userName) {
      logger.error('Login configuration error: USER/USER_NAME not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
   }
   
   if (!process.env.PASSWORD) {
      logger.error('Login configuration error: PASSWORD not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
   }
   
   if (!process.env.SECRET) {
      logger.error('Login configuration error: SECRET not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
   }

   if (username === userName && password === process.env.PASSWORD) {
      try {
         const token = jwt.sign({ user: userName }, process.env.SECRET);
         const cookies = new Cookies(req, res);
         const parsedDuration = Number.parseInt(process.env.SESSION_DURATION ?? '', 10);
         const sessionDurationHours = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 24;
         const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
         const expiryDate = new Date(Date.now() + sessionDurationMs);
         
         cookies.set('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: sessionDurationMs,
            expires: expiryDate,
         });

         logger.info('Login successful', {
            username: userName,
            sessionDuration: sessionDurationHours,
            expiresAt: expiryDate.toISOString(),
            duration: Date.now() - startTime,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
         });

         return res.status(200).json({ success: true, error: null });
      } catch (error) {
         logger.error('Login failed: JWT token generation error', error instanceof Error ? error : new Error(String(error)), {
            username: userName,
            duration: Date.now() - startTime
         });
         return res.status(500).json({ error: 'Internal server error' });
      }
   }

   const error = username !== userName ? 'Incorrect Username' : 'Incorrect Password';
   
   logger.warn('Login failed: invalid credentials', {
      username,
      reason: error,
      validUsername: username === userName,
      duration: Date.now() - startTime,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown'
   });

   return res.status(401).json({ success: false, error });
};
