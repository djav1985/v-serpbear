import type { NextApiRequest, NextApiResponse } from 'next';
import Cookies from 'cookies';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

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
      'POST:/api/searchconsole',
      'GET:/api/searchconsole',
      'GET:/api/insight',
   ];
   
   // Validate Bearer prefix before extracting API key
   let verifiedAPI = false;
   if (req.headers.authorization) {
      if (req.headers.authorization.startsWith('Bearer ')) {
         const apiKey = req.headers.authorization.substring('Bearer '.length);
         verifiedAPI = apiKey === process.env.APIKEY;
      }
   }
   
   // Compute normalized path once for all route checks
   const normalizedPath = req.url && req.method ? `${req.method}:${req.url.replace(/\?(.*)/, '')}` : '';
   const accessingAllowedRoute = normalizedPath && allowedApiRoutes.includes(normalizedPath);
   
   let authorized: string = '';
   let authMethod: string = 'none';
   let username: string | undefined;

   if (token && process.env.SECRET) {
      try {
         // Verify JWT token and extract user information
         const decoded = jwt.verify(token, process.env.SECRET) as JwtDecodedPayload;
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
         url: req.url,
         authMethod,
         username,
         duration
      });
   } else {
      logger.warn('Authentication failed', {
         method: req.method,
         url: req.url,
         reason: authorized,
         duration
      });
   }

   return authorized;
};

export default verifyUser;
