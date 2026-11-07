import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/thumbnail';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import * as thumbs from '../../utils/thumbnails';
import { createMockResponse } from '../__helpers__';

jest.mock('../../database/models/domain', () => ({
   __esModule: true,
   default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ __esModule: true, withApiLogging: (apiHandler: unknown) => apiHandler }));
jest.mock('../../utils/thumbnails', () => ({
   __esModule: true,
   THUMBNAIL_MAX_AGE_DAYS: 30,
   ensureThumbnails: jest.fn().mockResolvedValue(undefined),
   generateThumbnail: jest.fn(),
   getThumbnail: jest.fn(),
   listThumbnails: jest.fn(),
   readThumbnailFile: jest.fn(),
   isSafeThumbnailDomain: jest.requireActual('../../utils/thumbnails').isSafeThumbnailDomain,
}));

const verifyUserMock = verifyUser as unknown as jest.Mock;
const DomainMock = Domain as unknown as { findAll: jest.Mock; findOne: jest.Mock };
const thumbsMock = thumbs as unknown as Record<'ensureThumbnails' | 'generateThumbnail' | 'getThumbnail' | 'listThumbnails' | 'readThumbnailFile', jest.Mock>;

const makeReq = (method: string, query: Record<string, string> = {}) => ({ method, query, headers: {} } as unknown as NextApiRequest);

describe('/api/thumbnail', () => {
   let res: NextApiResponse;

   beforeEach(() => {
      jest.clearAllMocks();
      res = createMockResponse();
      verifyUserMock.mockReturnValue('authorized');
   });

   it('answers 401 without a login', async () => {
      verifyUserMock.mockReturnValue('Not authorized');

      await handler(makeReq('GET'), res);

      expect(res.status).toHaveBeenCalledWith(401);
   });

   it('lists the thumbnail date of each tracked domain and starts the missing ones', async () => {
      DomainMock.findAll.mockResolvedValue([
         { get: () => ({ domain: 'a.com' }) },
         { get: () => ({ domain: 'b.com' }) },
      ]);
      thumbsMock.listThumbnails.mockResolvedValue(new Map([['a.com', { domain: 'a.com', date: '2026-11-01', file: 'a.com_2026-11-01.jpg', version: '2026-11-01-1762500000000' }]]));

      await handler(makeReq('GET'), res);

      expect(thumbsMock.ensureThumbnails).toHaveBeenCalledWith([{ domain: 'a.com' }, { domain: 'b.com' }]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ thumbnails: { 'a.com': '2026-11-01-1762500000000' } });
   });

   it('serves the saved image of a domain', async () => {
      thumbsMock.getThumbnail.mockResolvedValue({ domain: 'a.com', date: '2026-11-01', file: 'a.com_2026-11-01.jpg' });
      thumbsMock.readThumbnailFile.mockResolvedValue(Buffer.from([1, 2, 3]));

      await handler(makeReq('GET', { domain: 'A.com' }), res);

      expect(thumbsMock.getThumbnail).toHaveBeenCalledWith('a.com');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', `private, max-age=${30 * 24 * 60 * 60}`);
      expect(res.status).toHaveBeenCalledWith(200);
   });

   it('answers 404 when the domain has no thumbnail yet, and 400 for an unsafe name', async () => {
      thumbsMock.getThumbnail.mockResolvedValue(undefined);
      await handler(makeReq('GET', { domain: 'a.com' }), res);
      expect(res.status).toHaveBeenCalledWith(404);

      const badRes = createMockResponse();
      await handler(makeReq('GET', { domain: '../etc/passwd' }), badRes);
      expect(badRes.status).toHaveBeenCalledWith(400);
      expect(thumbsMock.getThumbnail).toHaveBeenCalledTimes(1);
   });

   it('regenerates one tracked domain and reports the new date', async () => {
      DomainMock.findOne.mockResolvedValue({ ID: 1 });
      thumbsMock.generateThumbnail.mockResolvedValue(true);
      thumbsMock.getThumbnail.mockResolvedValue({ domain: 'a.com', date: '2026-11-07', file: 'a.com_2026-11-07.jpg', version: '2026-11-07-1762520000000' });

      await handler(makeReq('POST', { domain: 'a.com' }), res);

      expect(thumbsMock.generateThumbnail).toHaveBeenCalledWith('a.com', 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ thumbnail: '2026-11-07-1762520000000' });
   });

   it('answers 404 for an untracked domain and 502 when no screenshot could be made', async () => {
      DomainMock.findOne.mockResolvedValueOnce(null);
      await handler(makeReq('POST', { domain: 'a.com' }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(thumbsMock.generateThumbnail).not.toHaveBeenCalled();

      const failRes = createMockResponse();
      DomainMock.findOne.mockResolvedValueOnce({ ID: 1 });
      thumbsMock.generateThumbnail.mockResolvedValue(false);
      thumbsMock.getThumbnail.mockResolvedValue(undefined);
      await handler(makeReq('POST', { domain: 'a.com' }), failRes);
      expect(failRes.status).toHaveBeenCalledWith(502);
   });

   it('rejects other methods', async () => {
      await handler(makeReq('DELETE'), res);

      expect(res.status).toHaveBeenCalledWith(405);
   });
});
