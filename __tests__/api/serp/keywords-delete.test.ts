import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import { asHandler } from '../../__helpers__/routeAdapter';
import * as handlerRoute from '../../../app/api/serp/keywords/route';
import Keyword from '../../../database/models/keyword';
import verifyUser from '../../../utils/verifyUser';
import { updateDomainStats } from '../../../utils/updateDomainStats';
const handler = asHandler(handlerRoute);

jest.mock('../../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn(), transaction: jest.fn(async (options: unknown, work?: (t: unknown) => Promise<unknown>) => (work ?? (options as (t: unknown) => Promise<unknown>))({ id: 'tx' })) },
}));
jest.mock('../../../database/models/keyword', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
  },
}));
jest.mock('../../../database/models/domain', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: { where: { domain: string[] } }) => (
      where.domain.map((name: string) => ({ get: () => ({ domain: name }) }))
    )),
  },
}));
jest.mock('../../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn(),
  refreshKeywordsByIds: jest.fn().mockResolvedValue([]),
  markKeywordsAsUpdating: jest.fn().mockResolvedValue(undefined),
  clearKeywordUpdatingFlags: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));
jest.mock('../../../utils/adwords', () => ({
  __esModule: true,
  getKeywordsVolume: jest.fn(),
  updateKeywordsVolumeData: jest.fn(),
}));
jest.mock('../../../scrapers/index', () => ({
  __esModule: true,
  default: [],
}));
jest.mock('../../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../utils/refreshQueue', () => ({
  __esModule: true,
  refreshQueue: (() => {
    const isDomainLocked = jest.fn((_domain?: string) => false);
    return {
      enqueue: jest.fn().mockResolvedValue(undefined),
      isDomainLocked,
      reserveDomains: jest.fn((domains: string[]) => (domains.some((domain) => isDomainLocked(domain)) ? null : jest.fn())),
    };
  })(),
}));
jest.mock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('../../../utils/updateDomainStats', () => ({
  __esModule: true,
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));


const keywordMock = Keyword as unknown as {
    update: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    bulkCreate: jest.Mock;
    destroy: jest.Mock;
    count: jest.Mock;
  };

const verifyUserMock = verifyUser as unknown as jest.Mock;


describe('DELETE /api/serp/keywords retry queue cleanup', () => {
    it('removes deleted keyword IDs from the JSON body and rejects non-integer IDs', async () => {
      const { retryQueueManager } = require('../../../utils/retryQueueManager');
      (updateDomainStats as jest.Mock).mockClear();
      verifyUserMock.mockReturnValue('authorized');
      keywordMock.findAll.mockResolvedValue([{ ID: 1, domain: 'example.com' }, { ID: 2, domain: 'example.com' }]);
      keywordMock.destroy.mockResolvedValue(2);

      const req = { method: 'DELETE', query: {}, body: { ids: [1, 2] }, headers: {} } as unknown as NextApiRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

      await handler(req, res);

      expect(retryQueueManager.removeBatch).toHaveBeenCalledWith(new Set([1, 2]));
      expect(res.status).toHaveBeenCalledWith(200);
      // Two keywords on one domain: the stats are recalculated once for that domain
      expect(updateDomainStats).toHaveBeenCalledTimes(1);
      expect(updateDomainStats).toHaveBeenCalledWith('example.com');

      keywordMock.findAll.mockResolvedValue([{ ID: 7, domain: 'example.com' }]);
      keywordMock.destroy.mockResolvedValue(1);

      const bodyReq = { method: 'DELETE', query: {}, body: { ids: [7] }, headers: {} } as unknown as NextApiRequest;
      const bodyRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(bodyReq, bodyRes);

      expect(keywordMock.destroy).toHaveBeenCalledWith({ where: { ID: { [Op.in]: [7] } } });
      expect(bodyRes.status).toHaveBeenCalledWith(200);

      const badReq = { method: 'DELETE', query: {}, body: { ids: [7, 'abc'] }, headers: {} } as unknown as NextApiRequest;
      const badRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(badReq, badRes);

      expect(badRes.status).toHaveBeenCalledWith(400);
    });

    it('recalculates the stats once for each domain the deleted keywords belong to', async () => {
      (updateDomainStats as jest.Mock).mockClear();
      verifyUserMock.mockReturnValue('authorized');
      keywordMock.findAll.mockResolvedValue([{ ID: 1, domain: 'a.com' }, { ID: 2, domain: 'b.com' }, { ID: 3, domain: 'a.com' }]);
      keywordMock.destroy.mockResolvedValue(3);

      const req = { method: 'DELETE', query: {}, body: { ids: [1, 2, 3] }, headers: {} } as unknown as NextApiRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(updateDomainStats).toHaveBeenCalledTimes(2);
      expect(updateDomainStats).toHaveBeenCalledWith('a.com');
      expect(updateDomainStats).toHaveBeenCalledWith('b.com');
    });

    it('still answers 200 when the stats recalculation fails after the keywords are deleted', async () => {
      (updateDomainStats as jest.Mock).mockClear();
      (updateDomainStats as jest.Mock).mockRejectedValueOnce(new Error('stats failed'));
      verifyUserMock.mockReturnValue('authorized');
      keywordMock.findAll.mockResolvedValue([{ ID: 9, domain: 'example.com' }]);
      keywordMock.destroy.mockResolvedValue(1);

      const req = { method: 'DELETE', query: {}, body: { ids: [9] }, headers: {} } as unknown as NextApiRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(req, res);

      expect(keywordMock.destroy).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  })
