import { NextApiRequest } from 'next';
import { createMockResponse } from '../../__helpers__';
jest.mock('../../../utils/searchConsole');
jest.mock('../../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../../utils/verifyUser');
jest.mock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('../../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

describe('volume', () => {
    let handler: any;
    let db: any;
    let Keyword: any;
    let verifyUser: any;
    let parseKeywords: any;
    let getKeywordsVolume: any;
    let updateKeywordsVolumeData: any;
    jest.isolateModules(() => {
      jest.doMock('../../../database/database', () => ({
         __esModule: true,
         default: { sync: jest.fn() },
      }));
      jest.doMock('../../../database/models/keyword', () => ({
         __esModule: true,
         default: {
            findAll: jest.fn(),
         },
      }));
      jest.doMock('../../../utils/verifyUser', () => ({
         __esModule: true,
         default: jest.fn(),
      }));
      jest.doMock('../../../utils/parseKeywords', () => ({
         __esModule: true,
         default: jest.fn(),
      }));
      jest.doMock('../../../utils/adwords', () => ({
         __esModule: true,
         getKeywordsVolume: jest.fn(),
         updateKeywordsVolumeData: jest.fn(),
      }));
      jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
      const m0 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/google/volume/route'));
      handler = m0 && m0.__esModule ? m0.default : m0;
      const m1 = require('../../../database/database');
      db = m1 && m1.__esModule ? m1.default : m1;
      const m2 = require('../../../database/models/keyword');
      Keyword = m2 && m2.__esModule ? m2.default : m2;
      const m3 = require('../../../utils/verifyUser');
      verifyUser = m3 && m3.__esModule ? m3.default : m3;
      const m4 = require('../../../utils/parseKeywords');
      parseKeywords = m4 && m4.__esModule ? m4.default : m4;
      const m5 = require('../../../utils/adwords');
      getKeywordsVolume = m5.getKeywordsVolume;
      updateKeywordsVolumeData = m5.updateKeywordsVolumeData;
    });

    const dbMock = db as unknown as { sync: jest.Mock };
    const keywordModelMock = Keyword as unknown as { findAll: jest.Mock };
    const verifyUserMock = verifyUser as unknown as jest.Mock;
    const parseKeywordsMock = parseKeywords as unknown as jest.Mock;
    const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;
    const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

    describe('POST /api/google/volume', () => {
       beforeEach(() => {
          dbMock.sync.mockResolvedValue(undefined);
          verifyUserMock.mockReturnValue('authorized');
          parseKeywordsMock.mockReturnValue([{ ID: 1, keyword: 'alpha', volume: 0 }]);
          keywordModelMock.findAll.mockResolvedValue([
             { get: () => ({ ID: 1, keyword: 'alpha', volume: 0 }) },
          ]);
          getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 25 } });
          updateKeywordsVolumeDataMock.mockResolvedValue({ 1: 25 });
       });

       afterEach(() => {
          jest.clearAllMocks();
       });

       it('returns computed volumes when update flag is false', async () => {
          const req = {
             method: 'POST',
             body: { keywords: [1], update: false },
             headers: {},
          } as unknown as NextApiRequest;
          const res = createMockResponse();

          await handler(req, res);

          // db.sync() is now called at startup via instrumentation, not in handlers
          expect(verifyUserMock).toHaveBeenCalledWith(expect.any(Request));
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
          parseKeywordsMock.mockReturnValueOnce([{ ID: 1, keyword: 'alpha', volume: 0 }])
             .mockReturnValueOnce([{ ID: 1, keyword: 'alpha', volume: 25 }]);
          const req = {
             method: 'POST',
             body: { keywords: [1], update: true },
             headers: {},
          } as unknown as NextApiRequest;
          const res = createMockResponse();

          await handler(req, res);

          expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 25 }, [{ ID: 1, keyword: 'alpha', volume: 0 }]);
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
          const res = createMockResponse();

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
          const res = createMockResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(keywordModelMock.findAll).not.toHaveBeenCalled();
       });

       it('returns 400 when domain is not a string', async () => {
          const req = { method: 'POST', body: { keywords: [], domain: { $ne: '' } }, headers: {} } as unknown as NextApiRequest;
          const res = createMockResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(keywordModelMock.findAll).not.toHaveBeenCalled();
       });

       it('returns 400 when update is not a boolean', async () => {
          const req = { method: 'POST', body: { keywords: [1], update: 'false' }, headers: {} } as unknown as NextApiRequest;
          const res = createMockResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(keywordModelMock.findAll).not.toHaveBeenCalled();
       });

       it('limits how often domain=all can start paid lookups', async () => {
          const { resetRateLimits } = jest.requireActual('../../../utils/rateLimit');
          resetRateLimits();
          const run = async () => {
             const req = { method: 'POST', body: { domain: 'all', update: false }, headers: {}, socket: { remoteAddress: '192.0.2.5' } } as unknown as NextApiRequest;
             const res = createMockResponse();
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
          updateKeywordsVolumeDataMock.mockRejectedValue(new Error('db failure'));
          const req = { method: 'POST', body: { keywords: [1] }, headers: {} } as unknown as NextApiRequest;
          const res = createMockResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(500);
       });
    });
  });
