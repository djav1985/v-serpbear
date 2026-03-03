import type { NextApiRequest, NextApiResponse } from 'next';
import nodeMailer from 'nodemailer';
import handler from '../../pages/api/ideas/email';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../pages/api/settings';
import generateKeywordIdeasEmail from '../../utils/generateKeywordIdeasEmail';
import { getBranding } from '../../utils/branding';

const { platformName } = getBranding();

type MockedResponse = Partial<NextApiResponse> & {
   status: jest.Mock;
   json: jest.Mock;
};

type DomainRecord = {
   get: () => DomainType;
};

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: { sync: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
   __esModule: true,
   default: { findOne: jest.fn() },
}));

jest.mock('../../utils/verifyUser');

jest.mock('../../pages/api/settings', () => ({
   __esModule: true,
   getAppSettings: jest.fn(),
}));

jest.mock('../../utils/generateKeywordIdeasEmail');

jest.mock('nodemailer', () => ({
   __esModule: true,
   default: { createTransport: jest.fn() },
}));

jest.mock('../../utils/apiLogging', () => ({
   __esModule: true,
   default: (h: any) => h,
   withApiLogging: (h: any) => h,
}));

jest.mock('../../database/init', () => ({
   ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

describe('/api/ideas/email', () => {
   let req: Partial<NextApiRequest>;
   let res: MockedResponse;
   let sendMailMock: jest.Mock;
   let domainRecord: DomainRecord;

   const keywordPayload = {
      keyword: 'new term',
      avgMonthlySearches: 50,
      monthlySearchVolumes: { '2024-01': '50' },
      competition: 'LOW',
      competitionIndex: 0.21,
   };

   beforeEach(() => {
      req = {
         method: 'POST',
         body: { domain: 'example.com', keywords: [keywordPayload] },
         headers: {},
      } as Partial<NextApiRequest>;

      res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as MockedResponse;

      domainRecord = {
         get: () => ({
            ID: 1,
            domain: 'example.com',
            slug: 'example-com',
            notification: true,
            notification_interval: 'daily',
            notification_emails: 'alerts@example.com',
            lastUpdated: '2024-01-01T00:00:00.000Z',
            added: '2024-01-01T00:00:00.000Z',
         } as DomainType),
      };

      sendMailMock = jest.fn().mockResolvedValue(undefined);
      (nodeMailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });
      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (getAppSettings as jest.Mock).mockResolvedValue({
         smtp_server: 'smtp.example.com',
         smtp_port: '587',
         smtp_username: 'user',
         smtp_password: 'pass',
         notification_email: 'default@example.com',
         notification_email_from: 'sender@example.com',
         notification_email_from_name: platformName,
         smtp_tls_servername: 'smtp.example.com',
      });
      (generateKeywordIdeasEmail as jest.Mock).mockReturnValue('<html></html>');
      (Domain.findOne as jest.Mock).mockResolvedValue(domainRecord);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('returns 401 when verification fails', async () => {
      (verifyUser as jest.Mock).mockReturnValue('Unauthorized');

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(verifyUser).toHaveBeenCalledWith(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
      expect(sendMailMock).not.toHaveBeenCalled();
   });

   it('rejects requests without a domain', async () => {
      req.body = { keywords: [keywordPayload] };

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'A domain is required to email keyword ideas.' });
      expect(sendMailMock).not.toHaveBeenCalled();
   });

   it('rejects requests without SMTP configuration', async () => {
      (getAppSettings as jest.Mock).mockResolvedValueOnce({
         smtp_server: '',
         smtp_port: '',
         notification_email: '',
         notification_email_from: '',
         notification_email_from_name: '',
         smtp_tls_servername: '',
      });

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'SMTP has not been setup properly!' });
      expect(sendMailMock).not.toHaveBeenCalled();
   });

   it('rejects domains without notification emails', async () => {
      domainRecord = {
         get: () => ({
            ID: 1,
            domain: 'example.com',
            slug: 'example-com',
            notification: true,
            notification_interval: 'daily',
            notification_emails: '',
            lastUpdated: '2024-01-01T00:00:00.000Z',
            added: '2024-01-01T00:00:00.000Z',
         } as DomainType),
      };
      (Domain.findOne as jest.Mock).mockResolvedValue(domainRecord);

      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Notification email not configured for this domain.' });
      expect(sendMailMock).not.toHaveBeenCalled();
   });

   it('sends keyword idea emails when authorized', async () => {
      await handler(req as NextApiRequest, res as NextApiResponse);

      expect(Domain.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
      expect(generateKeywordIdeasEmail).toHaveBeenCalledWith({
         domain: 'example.com',
         keywords: [
            {
               keyword: 'new term',
               avgMonthlySearches: 50,
               monthlySearchVolumes: { '2024-01': 50 },
               competition: 'LOW',
               competitionIndex: 0.21,
            },
         ],
         platformName,
      });
      expect(sendMailMock).toHaveBeenCalledWith({
         from: `${platformName} <sender@example.com>`,
         to: 'alerts@example.com',
         subject: '[example.com] Keyword Ideas',
         html: '<html></html>',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
   });
});
