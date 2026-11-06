import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/volume';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
   __esModule: true,
   default: {
      findAll: jest.fn(),
   },
}));

jest.mock('../../utils/verifyUser', () => ({
   __esModule: true,
   default: jest.fn(),
}));

jest.mock('../../utils/parseKeywords', () => ({
   __esModule: true,
   default: jest.fn(),
}));

jest.mock('../../utils/adwords', () => ({
   __esModule: true,
   getKeywordsVolume: jest.fn(),
   updateKeywordsVolumeData: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
   withApiLogging: (handler: any) => handler,
}));

const dbMock = db as unknown as { sync: jest.Mock };
const keywordModelMock = Keyword as unknown as { findAll: jest.Mock };
const verifyUserMock = verifyUser as unknown as jest.Mock;
const parseKeywordsMock = parseKeywords as unknown as jest.Mock;
const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;
const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

describe('POST /api/volume', () => {
   beforeEach(() => {
      dbMock.sync.mockResolvedValue(undefined);
      verifyUserMock.mockReturnValue('authorized');
      parseKeywordsMock.mockReturnValue([{ ID: 1, keyword: 'alpha', volume: 0 }]);
      keywordModelMock.findAll.mockResolvedValue([
         { get: () => ({ ID: 1, keyword: 'alpha', volume: 0 }) },
      ]);
      getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 25 } });
      updateKeywordsVolumeDataMock.mockResolvedValue(true);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   const createResponse = () => {
      const res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;
      return res;
   };

   it('returns computed volumes when update flag is false', async () => {
      const req = {
         method: 'POST',
         body: { keywords: [1], update: false },
         headers: {},
      } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      // db.sync() is now called at startup via instrumentation, not in handlers
      expect(verifyUserMock).toHaveBeenCalledWith(req, res);
      expect(keywordModelMock.findAll).toHaveBeenCalled();
      expect(getKeywordsVolumeMock).toHaveBeenCalledWith([{ ID: 1, keyword: 'alpha', volume: 0 }]);
      expect(updateKeywordsVolumeDataMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
         keywords: [{ ID: 1, keyword: 'alpha', volume: 25 }],
         volumes: { 1: 25 },
      });
   });

   it('updates keyword volumes and returns refreshed data', async () => {
      const req = {
         method: 'POST',
         body: { keywords: [1], update: true },
         headers: {},
      } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 25 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
         keywords: [{ ID: 1, keyword: 'alpha', volume: 25 }],
         volumes: { 1: 25 },
      });
   });

   it('keeps keyword query when both keywords and domain are provided', async () => {
      parseKeywordsMock.mockReturnValue([
         { ID: 1, keyword: 'alpha', volume: 0 },
         { ID: 2, keyword: 'beta', volume: 0 },
      ]);
      keywordModelMock.findAll.mockResolvedValue([
         { get: () => ({ ID: 1, keyword: 'alpha', volume: 0 }) },
         { get: () => ({ ID: 2, keyword: 'beta', volume: 0 }) },
      ]);
      getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 25, 2: 50 } });

      const req = {
         method: 'POST',
         body: { keywords: [1], domain: 'example.com', update: false },
         headers: {},
      } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      expect(keywordModelMock.findAll).toHaveBeenCalledTimes(1);
      expect(getKeywordsVolumeMock).toHaveBeenCalledWith([
         { ID: 1, keyword: 'alpha', volume: 0 },
         { ID: 2, keyword: 'beta', volume: 0 },
      ]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
         keywords: [
            { ID: 1, keyword: 'alpha', volume: 25 },
            { ID: 2, keyword: 'beta', volume: 50 },
         ],
         volumes: { 1: 25, 2: 50 },
      });
   });

   it('returns 400 when a keyword ID is not a positive integer, without querying', async () => {
      const req = { method: 'POST', body: { keywords: [1, 'abc'] }, headers: {} } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(keywordModelMock.findAll).not.toHaveBeenCalled();
   });

   it('returns 400 when domain is not a string', async () => {
      const req = { method: 'POST', body: { keywords: [], domain: { $ne: '' } }, headers: {} } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(keywordModelMock.findAll).not.toHaveBeenCalled();
   });

   it('limits how often domain=all can start paid lookups', async () => {
      const { resetRateLimits } = jest.requireActual('../../utils/rateLimit');
      resetRateLimits();
      const run = async () => {
         const req = { method: 'POST', body: { domain: 'all', update: false }, headers: {}, socket: { remoteAddress: '192.0.2.5' } } as unknown as NextApiRequest;
         const res = createResponse();
         await handler(req, res);
         return res;
      };

      expect((await run()).status).toHaveBeenCalledWith(200);
      expect((await run()).status).toHaveBeenCalledWith(200);
      const limited = await run();
      expect(limited.status).toHaveBeenCalledWith(429);
      expect(getKeywordsVolumeMock).toHaveBeenCalledTimes(2);
      resetRateLimits();
   });

   it('answers 500 when saving the volumes fails', async () => {
      updateKeywordsVolumeDataMock.mockResolvedValue(false);
      const req = { method: 'POST', body: { keywords: [1] }, headers: {} } as unknown as NextApiRequest;
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
   });
});
