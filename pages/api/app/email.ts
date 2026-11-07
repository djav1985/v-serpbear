/// <reference path="../../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser, { hasValidSessionCookie } from '../../../utils/verifyUser';
import { withApiLogging } from '../../../utils/apiLogging';
import { errorResponse } from '../../../utils/api/response';
import { sendDigestEmails } from '../../../utils/api/emailDigest';
import { sendIdeasEmail } from '../../../utils/api/emailIdeas';

/**
 * POST /api/app/email?type=digest   Sends the keyword digest (optional `domain=`). The API key or a login session may call it.
 * POST /api/app/email?type=ideas    Emails selected keyword ideas (JSON body). Needs a login session; an API key is refused.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
   const requestId = (req as ExtendedRequest).requestId;
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json(errorResponse('UNAUTHORIZED', authorized, requestId));
   }
   if (req.method !== 'POST') {
      return res.status(405).json(errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', requestId));
   }

   const type = req.query?.type;
   if (type === 'digest') {
      return sendDigestEmails(req, res);
   }
   if (type === 'ideas') {
      // The API key can reach this route for digests, so ideas must check for a real login session itself.
      if (!hasValidSessionCookie(req, res)) {
         return res.status(403).json(errorResponse('FORBIDDEN', 'Emailing keyword ideas needs a login session, not an API key.', requestId));
      }
      return sendIdeasEmail(req, res);
   }
   return res.status(400).json(errorResponse('BAD_REQUEST', 'type must be "digest" or "ideas".', requestId));
}

export default withApiLogging(handler, { name: 'app/email' });
