import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/app/email';
import verifyUser, { hasValidSessionCookie } from '../../utils/verifyUser';
import { sendDigestEmails } from '../../utils/api/emailDigest';
import { sendIdeasEmail } from '../../utils/api/emailIdeas';

jest.mock('../../utils/verifyUser');
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: unknown) => fn }));
jest.mock('../../utils/api/emailDigest', () => ({ sendDigestEmails: jest.fn() }));
jest.mock('../../utils/api/emailIdeas', () => ({ sendIdeasEmail: jest.fn() }));

const run = async (options: { method?: string; type?: string | string[]; session?: boolean; auth?: string }) => {
   (verifyUser as jest.Mock).mockReturnValue(options.auth ?? 'authorized');
   (hasValidSessionCookie as jest.Mock).mockReturnValue(options.session ?? false);
   const req = { method: options.method ?? 'POST', query: options.type === undefined ? {} : { type: options.type }, headers: {} } as unknown as NextApiRequest;
   const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
   await handler(req, res);
   return res;
};

describe('POST /api/app/email routing', () => {
   beforeEach(() => jest.clearAllMocks());

   it('lets the API key (no session) send digests', async () => {
      await run({ type: 'digest', session: false });
      expect(sendDigestEmails).toHaveBeenCalledTimes(1);
      expect(sendIdeasEmail).not.toHaveBeenCalled();
   });

   it('lets a login session send digests too', async () => {
      await run({ type: 'digest', session: true });
      expect(sendDigestEmails).toHaveBeenCalledTimes(1);
   });

   it('refuses ideas emails for the API key with a 403 and sends nothing', async () => {
      const res = await run({ type: 'ideas', session: false });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(sendIdeasEmail).not.toHaveBeenCalled();
   });

   it('lets a login session send ideas emails', async () => {
      await run({ type: 'ideas', session: true });
      expect(sendIdeasEmail).toHaveBeenCalledTimes(1);
      expect(sendDigestEmails).not.toHaveBeenCalled();
   });

   it.each([[undefined], ['other'], [['digest', 'ideas']]])('rejects a missing or unsupported type (%p) with 400', async (type) => {
      const res = await run({ type: type as string | string[] | undefined, session: true });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(sendDigestEmails).not.toHaveBeenCalled();
      expect(sendIdeasEmail).not.toHaveBeenCalled();
   });

   it('answers 401 when not authorized and 405 for other methods, before looking at the type', async () => {
      expect((await run({ type: 'digest', auth: 'Not authorized' })).status).toHaveBeenCalledWith(401);
      expect((await run({ type: 'digest', method: 'GET' })).status).toHaveBeenCalledWith(405);
      expect(sendDigestEmails).not.toHaveBeenCalled();
   });
});
