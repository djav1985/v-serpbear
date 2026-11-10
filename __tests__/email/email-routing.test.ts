import type { NextApiRequest, NextApiResponse } from 'next';

describe('email routing', () => {
  let handler: any;
  let verifyUser: any;
  let hasValidSessionCookie: any;
  let sendDigestEmails: any;
  let sendIdeasEmail: any;
  jest.isolateModules(() => {
    jest.doMock('../../utils/verifyUser');
    jest.doMock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
    jest.doMock('../../utils/api/emailDigest', () => ({ sendDigestEmails: jest.fn(async () => Response.json({ success: true })) }));
    jest.doMock('../../utils/api/emailIdeas', () => ({ sendIdeasEmail: jest.fn(async () => Response.json({ success: true })) }));
    const m0 = require('../__helpers__/routeAdapter').asModule(require('../../app/api/app/email/route'));
    handler = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../../utils/verifyUser');
    verifyUser = m1 && m1.__esModule ? m1.default : m1;
    hasValidSessionCookie = m1.hasValidSessionCookie;
    const m2 = require('../../utils/api/emailDigest');
    sendDigestEmails = m2.sendDigestEmails;
    const m3 = require('../../utils/api/emailIdeas');
    sendIdeasEmail = m3.sendIdeasEmail;
  });

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

     it('returns 401 when authorization fails before dispatch', async () => {
        const res = await run({ type: 'digest', auth: 'Not authorized' });

        expect(res.status).toHaveBeenCalledWith(401);
        expect(sendDigestEmails).not.toHaveBeenCalled();
        expect(sendIdeasEmail).not.toHaveBeenCalled();
     });

     it('returns 405 for unsupported methods before dispatch', async () => {
        const res = await run({ type: 'digest', method: 'GET' });

        expect(res.status).toHaveBeenCalledWith(405);
        expect(sendDigestEmails).not.toHaveBeenCalled();
        expect(sendIdeasEmail).not.toHaveBeenCalled();
     });
  });
});
