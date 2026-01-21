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

      expect(dbMock.sync).toHaveBeenCalled();
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
});
