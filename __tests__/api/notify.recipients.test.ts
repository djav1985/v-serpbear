import { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import handler from '../../pages/api/notify';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { canSendEmail } from '../../utils/emailThrottle';
import { getAppSettings } from '../../pages/api/settings';

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
jest.mock('../../utils/parseKeywords', () => ({
  __esModule: true,
  default: (keywords: unknown[]) => keywords,
}));
jest.mock('../../utils/generateEmail', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve('<html></html>')),
}));
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
  withApiLogging: (apiHandler: any) => apiHandler,
}));

const domainRow = (overrides: Record<string, unknown>) => ({
  get: () => ({
    domain: 'example.com',
    scrapeEnabled: 1,
    notification_interval: 'daily',
    notification_emails: 'owner@example.com',
    ...overrides,
  }),
});

describe('/api/notify recipients and outcomes', () => {
  let res: { status: jest.Mock; json: jest.Mock };
  let sendMailMock: jest.Mock;
  const req = { method: 'POST', query: {}, headers: {} } as unknown as NextApiRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    sendMailMock = jest.fn().mockResolvedValue(undefined);
    (nodeMailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (Keyword.findAll as jest.Mock).mockResolvedValue([]);
    (getAppSettings as jest.Mock).mockResolvedValue({
      smtp_server: 'smtp.test',
      smtp_port: '587',
      notification_email: 'global@example.com',
      notification_email_from: '',
      notification_email_from_name: 'SerpBear',
    });
    (canSendEmail as jest.Mock).mockResolvedValue({ canSend: true });
  });

  it('sends only to the domain address, never to the global fallback', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({})]);

    await handler(req, res as unknown as NextApiResponse);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 1, skipped: 0 }));
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
    (canSendEmail as jest.Mock).mockResolvedValue({ canSend: false, reason: 'Minimum interval not met.' });

    await handler(req, res as unknown as NextApiResponse);

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 0, skipped: 2 }));
  });

  it('returns 500 when every eligible domain fails to send', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([domainRow({})]);
    sendMailMock.mockRejectedValue(new Error('SMTP down'));

    await handler(req, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
