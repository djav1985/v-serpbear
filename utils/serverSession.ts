import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from './verifyUser';

export const LOGIN_PATH = '/login';

/**
 * Reads the signed login cookie and applies the same rules as the API: valid signature, not expired,
 * and not revoked by a later logout (session version). Returns the user name, or null when signed out.
 */
export const getSessionUser = async (): Promise<string | null> => {
   const token = (await cookies()).get('token')?.value;
   if (!token || !process.env.SECRET) { return null; }
   try {
      const decoded = verifySessionToken(token);
      return decoded?.user || 'authenticated_user';
   } catch (_error) {
      return null;
   }
};

/** For protected layouts and pages: sends signed-out visitors to the login route. */
export const requireSession = async (): Promise<string> => {
   const user = await getSessionUser();
   if (!user) { redirect(LOGIN_PATH); }
   return user;
};
