import type { NextApiRequest, NextApiResponse } from 'next';
import { withApiLogging } from '../../utils/apiLogging';
import verifyUser from '../../utils/verifyUser';
import { logger } from '../../utils/logger';

type AuthCheckResponse = {
  authenticated: boolean;
  user?: string;
  error?: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse<AuthCheckResponse>) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      authenticated: false, 
      error: 'Method not allowed' 
    });
  }

  const authorized = verifyUser(req, res);
  
  if (authorized === 'authorized') {
    // Try to extract user from JWT token for additional info
    try {
      const jwt = await import('jsonwebtoken');
      const Cookies = await import('cookies');
      
      const cookies = new Cookies.default(req, res);
      const token = cookies.get('token');
      
      let user = 'authenticated_user';
      if (token && process.env.SECRET) {
        const decoded = jwt.verify(token, process.env.SECRET) as any;
        user = decoded?.user || user;
      }

      return res.status(200).json({
        authenticated: true,
        user,
      });
    } catch (error) {
      logger.warn('Failed to decode JWT token in auth check', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return res.status(200).json({
        authenticated: true,
        user: 'authenticated_user',
      });
    }
  } else {
    return res.status(401).json({
      authenticated: false,
      error: authorized,
    });
  }
};

export default withApiLogging(handler, {
  name: 'auth-check',
  logBody: false,
  // Successful request logs respect the shared LOG_SUCCESS_EVENTS toggle
  logSuccess: logger.isSuccessLoggingEnabled(),
});