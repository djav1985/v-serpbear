/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { withApiLogging } from '../../utils/apiLogging';
import verifyUser from '../../utils/verifyUser';
import { logger } from '../../utils/logger';
import { errorResponse } from '../../utils/api/response';

type AuthCheckResponse = {
  authenticated: boolean;
  user?: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const requestId = (req as ExtendedRequest).requestId;

  if (req.method !== 'GET') {
    return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
  }

  const authorized = verifyUser(req, res);
  
  if (authorized === 'authorized') {
    // Try to extract user from JWT token for additional info
    try {
      const cookies = new Cookies(req, res);
      const token = cookies.get('token');
      
      let user = 'authenticated_user';
      if (token && process.env.SECRET) {
        const decoded = jwt.verify(token, process.env.SECRET) as JwtDecodedPayload;
        user = decoded?.user || user;
      }

      return res.status(200).json({
        authenticated: true,
        user,
      } as AuthCheckResponse);
    } catch (error) {
      logger.warn('Failed to decode JWT token in auth check', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return res.status(200).json({
        authenticated: true,
        user: 'authenticated_user',
      } as AuthCheckResponse);
    }
  } else {
    return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
  }
};

export default withApiLogging(handler, {
  name: 'auth-check',
  logBody: false,
});