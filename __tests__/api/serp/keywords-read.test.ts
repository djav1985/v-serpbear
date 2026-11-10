import type { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../../__helpers__/routeAdapter';
import * as handlerRoute from '../../../app/api/serp/keywords/route';
import Keyword from '../../../database/models/keyword';
import verifyUser from '../../../utils/verifyUser';
import { getAppSettings } from '../../../utils/appSettings';
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

const getAppSettingsMock = getAppSettings as unknown as jest.Mock;


describe('GET /api/serp/keywords history7d backfill', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
    });

    it('backfills history7d for legacy keywords that are missing it', async () => {
      const legacyKeywordRecord = {
        get: () => ({
          ID: 6,
          keyword: 'legacy kw',
          history: '{"2024-1-1":5,"2024-1-2":4,"2024-1-3":3,"2024-1-4":2,"2024-1-5":1,"2024-1-6":6,"2024-1-7":7,"2024-1-8":8}',
          history7d: null,
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          device: 'desktop',
          domain: 'example.com',
          country: 'US',
          updating: 0,
          sticky: 0,
          mapPackTop3: 0,
          localResults: '[]',
        }),
      };

      keywordMock.findAll.mockResolvedValueOnce([legacyKeywordRecord]);
      keywordMock.update.mockResolvedValue([1]);
      getAppSettingsMock.mockResolvedValue({});

      const req = {
        method: 'GET',
        query: { domain: 'example.com' },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      // Flush the setImmediate queue so the off-path backfill runs
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(200);
      // Backfill should write history7d for the legacy row
      expect(keywordMock.update).toHaveBeenCalledWith(
        { history7d: expect.any(String) },
        { where: { ID: 6, history: expect.any(String), history7d: null } },
      );
    });
  })

describe('keyword route', () => {
  let handler: any;
  let Keyword: any;
  let verifyUser: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../../../database/models/keyword', () => ({
      __esModule: true,
      default: { findOne: jest.fn() },
    }));
    jest.doMock('../../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
    const m0 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/keyword/route'));
    handler = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../../../database/models/keyword');
    Keyword = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../../../utils/verifyUser');
    verifyUser = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../__helpers__');
    createMockResponse = m3.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const KeywordMock = Keyword as unknown as { findOne: jest.Mock };

  describe('GET /api/serp/keyword', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
    });

    it('rejects malformed IDs with 400', async () => {
      for (const id of ['12abc', '1.5', '-3', '0', '1e2', ' ']) {
        const res = createMockResponse();
        await handler({ method: 'GET', query: { id }, headers: {} } as unknown as NextApiRequest, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(KeywordMock.findOne).not.toHaveBeenCalled();
      }
    });

    it('looks up a plain integer id', async () => {
      KeywordMock.findOne.mockResolvedValue(null);
      const res = createMockResponse();
      await handler({ method: 'GET', query: { id: '12' }, headers: {} } as unknown as NextApiRequest, res);

      expect(KeywordMock.findOne).toHaveBeenCalledWith({ where: { ID: 12 } });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns the parsed keyword when the ID is tracked', async () => {
      const keyword = {
        ID: 12,
        keyword: 'coffee shops',
        country: 'US',
        device: 'desktop',
        domain: 'example.com',
        get: () => ({ ID: 12, keyword: 'coffee shops', country: 'US', device: 'desktop', domain: 'example.com' }),
      };
      KeywordMock.findOne.mockResolvedValue(keyword);
      const res = createMockResponse();

      await handler({ method: 'GET', query: { id: '12' }, headers: {} } as unknown as NextApiRequest, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ keyword: expect.objectContaining({ ID: 12, keyword: 'coffee shops' }) }));
    });

    it.each([
      [{}, 400],
      [{ id: '9007199254740992' }, 400],
    ])('rejects missing or unsafe keyword IDs (%p)', async (query, status) => {
      const res = createMockResponse();
      await handler({ method: 'GET', query, headers: {} } as unknown as NextApiRequest, res);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(KeywordMock.findOne).not.toHaveBeenCalled();
    });

    it('returns a server error when the keyword lookup fails', async () => {
      KeywordMock.findOne.mockRejectedValue(new Error('database unavailable'));
      const res = createMockResponse();
      await handler({ method: 'GET', query: { id: '12' }, headers: {} } as unknown as NextApiRequest, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
})
