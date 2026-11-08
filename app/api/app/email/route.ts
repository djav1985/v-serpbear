import { createRoute, fail, getParam, type ApiContext } from '../../../../utils/apiLogging';
import { hasValidSessionCookie } from '../../../../utils/verifyUser';
import { sendDigestEmails } from '../../../../utils/api/emailDigest';
import { sendIdeasEmail } from '../../../../utils/api/emailIdeas';

/**
 * POST /api/app/email?type=digest   Sends the keyword digest (optional `domain=`). The API key or a login session may call it.
 * POST /api/app/email?type=ideas    Emails selected keyword ideas (JSON body). Needs a login session; an API key is refused.
 */
const sendEmail = async (req: Request, ctx: ApiContext) => {
   const type = getParam(req, 'type');
   if (type === 'digest') {
      return sendDigestEmails(req, ctx);
   }
   if (type === 'ideas') {
      // The API key can reach this route for digests, so ideas must check for a real login session itself.
      if (!hasValidSessionCookie(req)) {
         return fail(403, 'FORBIDDEN', 'Emailing keyword ideas needs a login session, not an API key.', ctx);
      }
      return sendIdeasEmail(req, ctx);
   }
   return fail(400, 'BAD_REQUEST', 'type must be "digest" or "ideas".', ctx);
};

export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'app/email', POST: sendEmail });
