import { createRoute, json, type ApiContext } from '../../../../utils/apiLogging';
import { verifySessionToken } from '../../../../utils/verifyUser';
import { getCookie } from '../../../../utils/api/cookies';
import { logger } from '../../../../utils/logger';
import { APP_TIMEZONE } from '../../../../utils/timezone';

type AuthCheckResponse = {
   authenticated: boolean;
   user?: string;
   timezone: string;
};

// The route wrapper has already verified the cookie or API key, so this only adds who the user is.
const checkAuth = async (req: Request, _ctx: ApiContext) => {
   let user = 'authenticated_user';
   try {
      const token = getCookie(req, 'token');
      if (token && process.env.SECRET) {
         user = verifySessionToken(token)?.user || user;
      }
   } catch (error) {
      logger.debug('[API] Failed to decode JWT token in auth check', {
         error: error instanceof Error ? error.message : String(error),
      });
   }
   return json({ authenticated: true, user, timezone: APP_TIMEZONE } as AuthCheckResponse);
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'auth-check', GET: checkAuth });
