import { createRoute, fail, getQuery, readJson, type ApiContext } from '../../../../utils/apiLogging';
import { hasValidSessionCookie } from '../../../../utils/verifyUser';
import { sendDigestEmails } from '../../../../utils/api/emailDigest';
import { sendIdeasEmail } from '../../../../utils/api/emailIdeas';

/**
 * POST /api/app/email   JSON body `type` selects digest (optional `domain`) or ideas (`domain` and `keywords`).
 * Digest accepts the API key or a login session; ideas needs a login session and refuses an API key.
 */
const sendEmail = async (req: Request, ctx: ApiContext) => {
   const rawBody = await readJson(req);
   if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return fail(400, 'BAD_REQUEST', 'Request body must be a JSON object.', ctx);
   }
   const body = rawBody as { type?: unknown, keywords?: unknown };
   const query = getQuery(req);
   const type = body.type ?? query.type ?? (Array.isArray(body.keywords) ? 'ideas' : undefined);
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
