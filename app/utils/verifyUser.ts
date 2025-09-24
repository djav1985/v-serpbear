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
 *
 * Successful authentication logs respect the LOG_SUCCESS_EVENTS toggle managed by the shared logger.
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
   const verifiedAPI = req.headers.authorization ? req.headers.authorization.substring('Bearer '.length) === process.env.APIKEY : false;
   const accessingAllowedRoute = req.url && req.method && allowedApiRoutes.includes(`${req.method}:${req.url.replace(/\?(.*)/, '')}`);
   
   // Enhanced logging for all requests
   logger.verbose('Authentication check started', {
      method: req.method,
      url: req.url,
      hasToken: !!token,
      hasAuthHeader: !!req.headers.authorization,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
      successLoggingEnabled: logger.isSuccessLoggingEnabled(),
   });

   let authorized: string = '';
   let authMethod: string = 'none';
   let username: string | undefined;

   if (token && process.env.SECRET) {
      jwt.verify(token, process.env.SECRET, (err, decoded) => {
         if (err) {
            authorized = 'Not authorized';
            logger.authEvent('token_verification_failed', undefined, false, {
               error: err.message,
               tokenPresent: true
            });
         } else {
            authorized = 'authorized';
            authMethod = 'jwt_token';
            username = (decoded as any)?.user;
            logger.authEvent('token_verification_success', username, true);
         }
      });
   } else if (verifiedAPI && accessingAllowedRoute) {
      authorized = 'authorized';
      authMethod = 'api_key';
      logger.authEvent('api_key_verification_success', 'api_user', true, {
         route: `${req.method}:${req.url?.replace(/\?(.*)/, '')}`
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
            route: `${req.method}:${req.url?.replace(/\?(.*)/, '')}`
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
