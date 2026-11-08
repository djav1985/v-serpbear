import { createRoute, fail, json, type ApiContext } from '../../../../utils/apiLogging';
import { getCookie, serializeCookie } from '../../../../utils/api/cookies';
import { logger } from '../../../../utils/logger';
import { getClientIp } from '../../../../utils/api/clientIp';
import isRequestSecure from '../../../../utils/api/isRequestSecure';
import { revokeAllSessions } from '../../../../utils/sessionStore';

const logout = async (req: Request, ctx: ApiContext) => {
   const startTime = Date.now();
   try {
      const secureCookie = isRequestSecure(req);
      // Get user info before clearing token for logging
      let username = 'unknown_user';
      try {
         const jwt = await import('jsonwebtoken');
         const token = getCookie(req, 'token');
         if (token && process.env.SECRET) {
            const decoded = jwt.verify(token, process.env.SECRET) as JwtDecodedPayload;
            username = decoded?.user || username;
         }
      } catch (error) {
         logger.debug('[API] Failed to decode logout token during logout', { error: error instanceof Error ? error.message : String(error) });
      }

      // Revoke every issued token, including copies taken before logout, then clear the cookie
      await revokeAllSessions();

      const clearedCookie = serializeCookie('token', '', {
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

      return json({ success: true }, 200, { 'Set-Cookie': clearedCookie });
   } catch (error) {
      logger.error('Logout failed with exception', error instanceof Error ? error : new Error(String(error)), {
         duration: Date.now() - startTime
      });
      return fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
   }
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'logout', POST: logout });
