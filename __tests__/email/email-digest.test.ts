 
import { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/app/email/route';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import generateEmail from '../../utils/generateEmail';
import { getAppSettings } from '../../utils/appSettings';
import { getBranding } from '../../utils/branding';
import { reserveEmailSend } from '../../utils/emailThrottle';
const handler = asHandler(handlerRoute);

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../utils/verifyUser');
jest.mock('../../utils/parseKeywords');
jest.mock('../../utils/generateEmail');
jest.mock('../../utils/emailThrottle', () => ({
  reserveEmailSend: jest.fn(() => Promise.resolve({ reserved: true, release: jest.fn(() => Promise.resolve()) })),
}));
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));
jest.mock('../../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));
jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());

describe('email digest', () => {
  const { platformName } = getBranding();

  type MockedResponse = Partial<NextApiResponse> & {
    status: jest.Mock;
    json: jest.Mock;
  };

  describe('/api/app/email (type=digest) - authentication', () => {
    let req: Partial<NextApiRequest>;
    let res: MockedResponse;
    let sendMailMock: jest.Mock;

    beforeEach(() => {
      req = {
        method: 'POST',
        query: { type: 'digest' },
        headers: {},
      };

      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as MockedResponse;

      sendMailMock = jest.fn().mockResolvedValue(undefined);
      (nodeMailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });
      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (parseKeywords as jest.Mock).mockImplementation((keywords) => keywords);
      (generateEmail as jest.Mock).mockResolvedValue('<html></html>');
      (getAppSettings as jest.Mock).mockResolvedValue({
        smtp_server: 'smtp.test',
        smtp_port: '587',
        smtp_username: '',
        smtp_password: '',
        notification_email_from: '',
        notification_email_from_name: platformName,
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('answers 401 when verification fails and 405 for an unsupported method, and sends no mail either way', async () => {
      (verifyUser as jest.Mock).mockReturnValue('Not authorized');

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(verifyUser).toHaveBeenCalledWith(expect.any(Request));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'UNAUTHORIZED' }) }),
      );
      expect(sendMailMock).not.toHaveBeenCalled();

      res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as MockedResponse;
      req.method = 'GET';
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }) }),
      );
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('returns 404 for a domain that does not exist', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (Domain.findOne as jest.Mock).mockResolvedValue(null);
      req.query = { type: 'digest', domain: 'Missing.com ' };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(Domain.findOne).toHaveBeenCalledWith({ where: { domain: 'missing.com' } });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('returns 400 when the domain query is repeated', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      req.query = { type: 'digest', domain: ['a.com', 'b.com'] };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Domain.findOne).not.toHaveBeenCalled();
    });

    it('sends notifications when authorized via API key header', async () => {
      req.headers = {
        authorization: 'Bearer valid-key',
      };

      (verifyUser as jest.Mock).mockImplementation((incomingReq: Request) => (
        incomingReq.headers.get('authorization') === 'Bearer valid-key'
          ? 'authorized'
          : 'Invalid API Key Provided.'
      ));

      const domainRecord = {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
          notification: 1,
          notification_emails: 'custom@example.com',
        }),
      };

      const keywordRecord = {
        get: () => ({
          keyword: 'rank tracker',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        }),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([domainRecord]);
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (parseKeywords as jest.Mock).mockReturnValue([
        {
          keyword: 'rank tracker',
          history: {},
          tags: [],
          lastResult: [],
          lastUpdateError: false,
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        },
      ]);

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(verifyUser).toHaveBeenCalledWith(expect.any(Request));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, error: null }));
      expect(Domain.findAll).toHaveBeenCalledTimes(1);
      expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        to: 'custom@example.com',
      }));
    });

    it('sanitizes SMTP hostnames and applies TLS overrides when provided', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      (getAppSettings as jest.Mock).mockResolvedValue({
        smtp_server: '  smtp.test.com.  ',
        smtp_port: ' 587 ',
        smtp_username: '',
        smtp_password: '',
        smtp_tls_servername: ' override.test. ',
        notification_email_from: ' ',
        notification_email_from_name: ` ${platformName} `,
      });

      const domainRecord = {
        get: () => ({
          domain: 'example.com',
          scrapeEnabled: 1,
          notification: 1,
          notification_emails: ' custom@example.com ',
        }),
      };

      const keywordRecord = {
        get: () => ({
          keyword: 'rank tracker',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        }),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([domainRecord]);
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (parseKeywords as jest.Mock).mockReturnValue([
        {
          keyword: 'rank tracker',
          history: {},
          tags: [],
          lastResult: [],
          lastUpdateError: false,
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        },
      ]);

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, error: null }));
      expect(nodeMailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
        host: 'smtp.test.com',
        port: 587,
        tls: expect.objectContaining({ servername: 'override.test' }),
      }));
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        to: 'custom@example.com',
        from: `${platformName} <no-reply@serpbear.com>`,
      }));
    });

    it('returns 400 when SMTP configuration is incomplete', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (getAppSettings as jest.Mock).mockResolvedValueOnce({
        smtp_server: '',
        smtp_port: '',
        smtp_username: '',
        smtp_password: '',
        notification_email_from: '',
        notification_email_from_name: platformName,
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'SMTP has not been setup properly!' }) }),
      );
      expect(nodeMailer.createTransport).not.toHaveBeenCalled();
    });

    it('returns 500 when all notifications fail to send', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      const domainRecord = {
        get: () => ({
          domain: 'example.com',
          notification: 1,
          scrapeEnabled: 1,
          notification_emails: 'custom@example.com',
        }),
      };

      const keywordRecord = {
        get: () => ({
          keyword: 'rank tracker',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        }),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([domainRecord]);
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (parseKeywords as jest.Mock).mockReturnValue([
        {
          keyword: 'rank tracker',
          history: {},
          tags: [],
          lastResult: [],
          lastUpdateError: false,
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        },
      ]);

      sendMailMock.mockRejectedValueOnce(new Error('SMTP connect failed'));

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', message: 'All notification emails failed to send. Please check your SMTP configuration.' }) }),
      );
      expect(sendMailMock).toHaveBeenCalled();
    });

    it('returns 500 when single domain notification fails', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      req.query = { type: 'digest', domain: 'example.com' };

      const domainRecord = {
        get: () => ({
          domain: 'example.com',
          notification: 1,
          scrapeEnabled: 1,
          notification_emails: 'custom@example.com',
        }),
      };

      const keywordRecord = {
        get: () => ({
          keyword: 'rank tracker',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        }),
      };

      (Domain.findOne as jest.Mock).mockResolvedValue(domainRecord);
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (parseKeywords as jest.Mock).mockReturnValue([
        {
          keyword: 'rank tracker',
          history: {},
          tags: [],
          lastResult: [],
          lastUpdateError: false,
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        },
      ]);

      sendMailMock.mockRejectedValueOnce(new Error('SMTP connect failed'));

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', message: 'All notification emails failed to send. Please check your SMTP configuration.' }) }),
      );
      expect(sendMailMock).toHaveBeenCalled();
      expect(Domain.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
    });

    it('returns 200 with partial success when some notifications succeed and others fail', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      const domainRecord1 = {
        get: () => ({
          domain: 'example.com',
          notification: 1,
          scrapeEnabled: 1,
          notification_emails: 'success@example.com',
        }),
      };

      const domainRecord2 = {
        get: () => ({
          domain: 'another.com',
          notification: 1,
          scrapeEnabled: 1,
          notification_emails: 'fail@example.com',
        }),
      };

      const keywordRecord = {
        get: () => ({
          keyword: 'rank tracker',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        }),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([domainRecord1, domainRecord2]);
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (parseKeywords as jest.Mock).mockReturnValue([
        {
          keyword: 'rank tracker',
          history: {},
          tags: [],
          lastResult: [],
          lastUpdateError: false,
          position: 5,
          country: 'US',
          device: 'desktop',
          location: 'US',
          lastUpdated: new Date().toISOString(),
        },
      ]);

      // First call succeeds, second call fails
      sendMailMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('SMTP failed for second domain'));

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, error: null }));
      expect(sendMailMock).toHaveBeenCalledTimes(2);
    });

    it('returns success message when no domains are enabled for notifications', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');

      const domainRecord = {
        get: () => ({
          domain: 'example.com',
          notification: 0,
          scrapeEnabled: 0,
          notification_emails: 'custom@example.com',
        }),
      };

      (Domain.findAll as jest.Mock).mockResolvedValue([domainRecord]);

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, error: null, message: 'No domains are enabled for notifications.' }));
      expect(nodeMailer.createTransport).not.toHaveBeenCalled();
      expect(sendMailMock).not.toHaveBeenCalled();
    });
  });

  const domainRow = (overrides: Record<string, unknown>) => ({
    get: () => ({
      domain: 'example.com',
      scrapeEnabled: 1,
      notification_emails: 'owner@example.com',
      ...overrides,
    }),
  });

  describe('/api/app/email (type=digest) recipients and outcomes', () => {
    let res: { status: jest.Mock; json: jest.Mock };
    let sendMailMock: jest.Mock;
    const req = { method: 'POST', query: { type: 'digest' }, headers: {} } as unknown as NextApiRequest;

    beforeEach(() => {
      jest.clearAllMocks();
      res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      sendMailMock = jest.fn().mockResolvedValue(undefined);
      (nodeMailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      // parseKeywords and generateEmail are automocked above; give them the pass-through behaviour these tests expect
      (parseKeywords as jest.Mock).mockImplementation((keywords) => keywords);
      (generateEmail as jest.Mock).mockResolvedValue('<html></html>');
      (Keyword.findAll as jest.Mock).mockResolvedValue([]);
      (getAppSettings as jest.Mock).mockResolvedValue({
        smtp_server: 'smtp.test',
        smtp_port: '587',
        notification_email: 'global@example.com',
        notification_email_from: '',
        notification_email_from_name: 'SerpBear',
      });
      (reserveEmailSend as jest.Mock).mockResolvedValue({ reserved: true, release: jest.fn(() => Promise.resolve()) });
    });

    it('sends only to the domain address, never to the global fallback', async () => {
      (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({})]);

      await handler(req, res as unknown as NextApiResponse);

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 1, skipped: 0 }));

      // Recipients are per domain, so a blank global address still sends to the domain address
      (getAppSettings as jest.Mock).mockResolvedValue({ smtp_server: 'smtp.test', smtp_port: '587' });
      const blankGlobalRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      sendMailMock.mockClear();

      await handler(req, blankGlobalRes as unknown as NextApiResponse);

      expect(blankGlobalRes.status).not.toHaveBeenCalledWith(400);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('skips a domain whose notification address is blank, and does not fall back to the global address', async () => {
      (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({ notification_emails: '   ' })]);

      await handler(req, res as unknown as NextApiResponse);

      expect(sendMailMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 0, skipped: 1 }));
    });

    it('returns 200 with a skipped count when every domain is throttled', async () => {
      (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({}), domainRow({ domain: 'other.com' })]);
      (reserveEmailSend as jest.Mock).mockResolvedValue({ reserved: false, reason: 'Minimum interval not met.', release: jest.fn() });

      await handler(req, res as unknown as NextApiResponse);

      expect(sendMailMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 0, skipped: 2 }));
    });

    it('gives the throttle slot back when setup fails after reserving it', async () => {
      (getAppSettings as jest.Mock).mockResolvedValue({ smtp_server: 'smtp.test', smtp_port: '587' });
      (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({})]);
      const release = jest.fn(() => Promise.resolve());
      (reserveEmailSend as jest.Mock).mockResolvedValue({ reserved: true, release });
      (nodeMailer.createTransport as jest.Mock).mockImplementation(() => { throw new Error('bad transport'); });

      await handler(req, res as unknown as NextApiResponse);

      expect(reserveEmailSend).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(500);
    });

  });
});

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

     it('answers 401 when not authorized and 405 for other methods, before looking at the type', async () => {
        expect((await run({ type: 'digest', auth: 'Not authorized' })).status).toHaveBeenCalledWith(401);
        expect((await run({ type: 'digest', method: 'GET' })).status).toHaveBeenCalledWith(405);
        expect(sendDigestEmails).not.toHaveBeenCalled();
     });
  });
});
