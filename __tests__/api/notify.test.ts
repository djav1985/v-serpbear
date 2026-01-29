import { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import handler from '../../pages/api/notify';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import generateEmail from '../../utils/generateEmail';
import { getAppSettings } from '../../pages/api/settings';
import { getBranding } from '../../utils/branding';

const { platformName } = getBranding();

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
  canSendEmail: jest.fn(() => Promise.resolve({ canSend: true })),
  recordEmailSent: jest.fn(() => Promise.resolve()),
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

jest.mock('../../pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

type MockedResponse = Partial<NextApiResponse> & {
  status: jest.Mock;
  json: jest.Mock;
};

describe('/api/notify - authentication', () => {
  let req: Partial<NextApiRequest>;
  let res: MockedResponse;
  let sendMailMock: jest.Mock;

  beforeEach(() => {
    req = {
      method: 'POST',
      query: {},
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
      notification_email: 'notify@example.com',
      notification_email_from: '',
      notification_email_from_name: platformName,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when verification fails', async () => {
    (verifyUser as jest.Mock).mockReturnValue('Not authorized');

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(verifyUser).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Not authorized' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 405 when using an unsupported HTTP method', async () => {
    req.method = 'GET';
    (verifyUser as jest.Mock).mockReturnValue('authorized');

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid Method' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends notifications when authorized via API key header', async () => {
    req.headers = {
      authorization: 'Bearer valid-key',
    };

    (verifyUser as jest.Mock).mockImplementation((incomingReq: NextApiRequest) => (
      incomingReq.headers?.authorization === 'Bearer valid-key'
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

    expect(verifyUser).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
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
      notification_email: ' notify@example.com ',
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
    expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
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

  it('skips domains with notifications disabled', async () => {
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
    expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
    expect(nodeMailer.createTransport).not.toHaveBeenCalled();
  });

  it('returns 400 when SMTP configuration is incomplete', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValueOnce({
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: '',
      notification_email: '',
      notification_email_from: '',
      notification_email_from_name: platformName,
    });

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'SMTP has not been setup properly!' });
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
    expect(res.json).toHaveBeenCalledWith({ 
      success: false, 
      error: 'All notification emails failed to send. Please check your SMTP configuration.' 
    });
    expect(sendMailMock).toHaveBeenCalled();
  });

  it('returns 500 when single domain notification fails', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');

    req.query = { domain: 'example.com' };

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
    expect(res.json).toHaveBeenCalledWith({ 
      success: false, 
      error: 'All notification emails failed to send. Please check your SMTP configuration.' 
    });
    expect(sendMailMock).toHaveBeenCalled();
    expect(Domain.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
  });

  it('returns 200 when notifications succeed for multiple domains', async () => {
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

    // Both calls succeed to avoid partial failure response
    sendMailMock.mockResolvedValue(undefined);

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });
});
