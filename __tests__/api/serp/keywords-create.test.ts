import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import { asHandler } from '../../__helpers__/routeAdapter';
import * as handlerRoute from '../../../app/api/serp/keywords/route';
import db from '../../../database/database';
import Keyword from '../../../database/models/keyword';
import Domain from '../../../database/models/domain';
import { buildStoredLocation } from '../../../utils/location';
import verifyUser from '../../../utils/verifyUser';
import { getAppSettings } from '../../../utils/appSettings';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../../utils/adwords';
import { refreshQueue } from '../../../utils/refreshQueue';
import { updateDomainStats } from '../../../utils/updateDomainStats';
import { createMockRequest, createMockResponse } from '../../__helpers__';
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


const dbMock = db as unknown as { sync: jest.Mock };

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

const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;

const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

const refreshQueueMock = refreshQueue as unknown as { enqueue: jest.Mock; isDomainLocked: jest.Mock; reserveDomains: jest.Mock };

const KeywordMock = Keyword as unknown as { findAll: jest.Mock; bulkCreate: jest.Mock; update: jest.Mock; destroy: jest.Mock };
const DomainMock = Domain as unknown as { findAll: jest.Mock };
const austin = buildStoredLocation({ city: 'Austin', state: 'Texas', countryCode: 'US' });
const storedRow = (values: Record<string, unknown>) => ({ get: () => ({ ID: 1, history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', ...values }) });

describe('POST /api/serp/keywords', () => {
beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
      jest.clearAllMocks();
      keywordMock.findAll.mockReset().mockResolvedValue([]);
      keywordMock.bulkCreate.mockReset();
      keywordMock.update.mockReset();
      keywordMock.destroy.mockReset();
      DomainMock.findAll.mockReset().mockImplementation(({ where }: { where: { domain: string[] } }) => (
        Promise.resolve(where.domain.map((domain) => ({ get: () => ({ domain }) })))
      ));
      dbMock.sync.mockResolvedValue(undefined);
      verifyUserMock.mockReturnValue('authorized');
      getAppSettingsMock.mockResolvedValue({
        adwords_account_id: 'acct',
        adwords_client_id: 'client',
        adwords_client_secret: 'secret',
        adwords_developer_token: 'token',
      });
      getKeywordsVolumeMock.mockResolvedValue({ volumes: false });
      updateKeywordsVolumeDataMock.mockResolvedValue(true);
      refreshQueueMock.enqueue.mockReset().mockResolvedValue(undefined);
      refreshQueueMock.isDomainLocked.mockReset().mockReturnValue(false);
      refreshQueueMock.reserveDomains.mockReset().mockImplementation((domains: string[]) => (
        domains.some((domain) => refreshQueueMock.isDomainLocked(domain)) ? null : jest.fn()
      ));
    });

describe('stored location on add', () => {
      const addRecord = { get: () => ({ ID: 1, keyword: 'alpha', history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', device: 'desktop', domain: 'example.com', country: 'US' }) };
      const postAdd = async (keyword: Record<string, unknown>) => {
        keywordMock.bulkCreate.mockResolvedValue([addRecord]);
        keywordMock.findAll.mockResolvedValueOnce([]);
        keywordMock.findAll.mockResolvedValue([addRecord]);
        getKeywordsVolumeMock.mockResolvedValue({ volumes: {} });
        updateKeywordsVolumeDataMock.mockResolvedValue(undefined);
        const req = createMockRequest({ method: 'POST', body: { keywords: [{ keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com', ...keyword }] } });
        const res = createMockResponse();
        await handler(req, res);
        const calls = keywordMock.bulkCreate.mock.calls;
        return calls[calls.length - 1][0][0];
      };

      it('stores a city-level location sent as one value, and builds City,State,Country Name from separate city and state fields', async () => {
        const combined = await postAdd({ location: 'Port Charlotte,Florida,United States' });
        expect(combined.location).toBe('Port Charlotte,Florida,United States');
        expect(combined.country).toBe('US');

        const split = await postAdd({ city: 'Austin', state: 'TX' });
        expect(split.location).toBe('Austin,TX,United States');
        expect(split.country).toBe('US');
      });

      it('rejects a city without a state on add and on location update, so the stored location is never dropped', async () => {
        keywordMock.bulkCreate.mockClear();
        const req = createMockRequest({ method: 'POST', body: { keywords: [{ keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com', city: 'Austin' }] } });
        const res = createMockResponse();
        await handler(req, res);
        expect(keywordMock.bulkCreate).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);

        const updateReq = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'Austin', country: 'US' } });
        const updateRes = createMockResponse();
        await handler(updateReq, updateRes);
        expect(keywordMock.update).not.toHaveBeenCalled();
        expect(updateRes.status).toHaveBeenCalledWith(400);
      });

      it('stores a blank location for a country-only keyword and keeps the country code', async () => {
        const row = await postAdd({ country: 'DE' });
        expect(row.location).toBe('');
        expect(row.country).toBe('DE');
      });
    });

it('still returns 201 when the background volume update fails after creation', async () => {
      const newKeywordRecord = {
        get: () => ({
          ID: 1,
          keyword: 'alpha',
          history: '{}',
          tags: '[]',
          lastResult: '[]',
          lastUpdateError: 'false',
          device: 'desktop',
          domain: 'example.com',
          country: 'US',
        }),
      };
      keywordMock.bulkCreate.mockResolvedValue([newKeywordRecord]);
      // Mock findAll to return the reloaded keyword with ID
      keywordMock.findAll.mockResolvedValue([newKeywordRecord]);
      getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 100 } });
      const volumeFailure = new Error('volume failure');
      updateKeywordsVolumeDataMock.mockRejectedValue(volumeFailure);

      const req = {
        method: 'POST',
        body: { keywords: [{ keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com' }] },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      keywordMock.findAll.mockResolvedValueOnce([]);
      await handler(req, res);

      expect(keywordMock.bulkCreate).toHaveBeenCalled();
      expect(getAppSettingsMock).toHaveBeenCalled();
      expect(getKeywordsVolumeMock).toHaveBeenCalled();
      // Let the background volume task run to completion (timers are faked in this suite)
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 100 }, expect.any(Array));
      expect(res.status).toHaveBeenCalledWith(201);
    });

it('returns 400 when keyword payload is missing', async () => {
      const req = {
        method: 'POST',
        body: {},
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'Keywords array is required' }),
      }));
      expect(keywordMock.bulkCreate).not.toHaveBeenCalled();
    });

it('deduplicates keyword tags before persistence', async () => {
      const now = new Date().toJSON();
      const bulkCreateResult = [{
        get: () => ({
          ID: 10,
          keyword: 'alpha',
          history: '{}',
          tags: JSON.stringify(['Primary', 'secondary']),
          lastResult: '[]',
          lastUpdateError: 'false',
          device: 'desktop',
          domain: 'example.com',
          country: 'US',
          added: now,
          lastUpdated: now,
        }),
      }];

      keywordMock.bulkCreate.mockResolvedValue(bulkCreateResult);
      // Mock findAll to return the reloaded keyword with ID
      keywordMock.findAll.mockResolvedValue(bulkCreateResult);
      getKeywordsVolumeMock.mockResolvedValue({ volumes: false });

      const req = {
        method: 'POST',
        body: {
          keywords: [{
            keyword: 'alpha',
            device: 'desktop',
            country: 'US',
            domain: 'example.com',
            tags: 'Primary, secondary, primary, SECONDARY',
          }],
        },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      keywordMock.findAll.mockResolvedValueOnce([]);
      await handler(req, res);

      expect(keywordMock.bulkCreate).toHaveBeenCalledWith([
        expect.objectContaining({
          tags: JSON.stringify(['Primary', 'secondary']),
          updatingStartedAt: now,
        }),
      ], { transaction: expect.anything() });
      expect(res.status).toHaveBeenCalledWith(201);
    });

it('locks all represented domains when enqueuing refresh after bulk add', async () => {
      const now = new Date().toJSON();
      keywordMock.bulkCreate.mockResolvedValue([]);
      keywordMock.findAll.mockResolvedValue([
        { get: () => ({ ID: 1, keyword: 'one', history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', device: 'desktop', domain: 'Example.com', country: 'US', added: now, lastUpdated: now }) },
        { get: () => ({ ID: 2, keyword: 'two', history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', device: 'desktop', domain: 'second.com', country: 'US', added: now, lastUpdated: now }) },
        { get: () => ({ ID: 3, keyword: 'three', history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', device: 'desktop', domain: 'example.com', country: 'US', added: now, lastUpdated: now }) },
      ]);
      getKeywordsVolumeMock.mockResolvedValue({ volumes: false });

      const req = {
        method: 'POST',
        body: {
          keywords: [
            { keyword: 'one', device: 'desktop', country: 'US', domain: 'Example.com' },
            { keyword: 'two', device: 'desktop', country: 'US', domain: 'second.com' },
            { keyword: 'three', device: 'desktop', country: 'US', domain: 'example.com' },
          ],
        },
        headers: {},
      } as unknown as NextApiRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

      keywordMock.findAll.mockResolvedValueOnce([]);
      await handler(req, res);

      expect(refreshQueueMock.enqueue).toHaveBeenCalledWith(
        expect.stringContaining('addKeywords-'),
        expect.any(Function),
        ['example.com', 'second.com'],
      );
    });

afterEach(() => {
      jest.useRealTimers();
    });
});

describe('POST /api/serp/keywords data rules', () => {
beforeEach(() => {
        jest.clearAllMocks();
    KeywordMock.findAll.mockReset().mockResolvedValue([]);
    KeywordMock.bulkCreate.mockReset();
    KeywordMock.update.mockReset();
    KeywordMock.destroy.mockReset();
    DomainMock.findAll.mockReset().mockResolvedValue([{ get: () => ({ domain: 'example.com' }) }]);
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockReset().mockResolvedValue({ scraper_type: 'serper', adwords_account_id: '' });
    (getKeywordsVolume as jest.Mock).mockReset().mockResolvedValue({ volumes: false });
    (updateKeywordsVolumeData as jest.Mock).mockReset().mockResolvedValue(true);
    (updateDomainStats as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

const postKeywords = async (keywords: Record<string, unknown>[]) => {
    const req = createMockRequest({ method: 'POST', body: { keywords } });
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return res;
  };

const newKeyword = { keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com' };

it('recalculates the domain stats after keywords are added', async () => {
    (updateDomainStats as jest.Mock).mockClear();
    KeywordMock.bulkCreate.mockResolvedValue([{ ID: 5, keyword: 'alpha' }]);
    KeywordMock.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([storedRow({ ID: 5, keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' })]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(1);
    expect(updateDomainStats).toHaveBeenCalledTimes(1);
    expect(updateDomainStats).toHaveBeenCalledWith('example.com');
  });

it('keeps a successful add response when the non-critical stats refresh fails', async () => {
    KeywordMock.bulkCreate.mockResolvedValue([{ ID: 53, keyword: 'alpha' }]);
    KeywordMock.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([
      storedRow({ ID: 53, keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' }),
    ]);
    (updateDomainStats as jest.Mock).mockRejectedValue(new Error('stats database unavailable'));

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(1);
    expect(updateDomainStats).toHaveBeenCalledWith('example.com');
  });

it('rejects keywords for a domain that is not tracked', async () => {
    DomainMock.findAll.mockResolvedValue([]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

it('returns 409 when the same keyword is already tracked on the domain, or appears twice in one request', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' })]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('alpha (desktop)') }) }));
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();

    const repeated = await postKeywords([newKeyword, { ...newKeyword }]);

    expect(repeated.status).toHaveBeenCalledWith(409);
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

it('reloads exactly the inserted rows by the IDs the insert returned', async () => {
    const created = [{ ID: 41, keyword: 'alpha' }];
    KeywordMock.bulkCreate.mockResolvedValue(created);
    KeywordMock.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([storedRow({ ID: 41, keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' })]);

    await postKeywords([newKeyword]);

    expect(KeywordMock.findAll).toHaveBeenLastCalledWith({ where: { ID: { [Op.in]: [41] } } });
    expect(KeywordMock.findAll).not.toHaveBeenLastCalledWith(expect.objectContaining({ where: { added: expect.anything() } }));
  });

it('still saves keywords added while the domain is being refreshed, and queues their scrape behind the refresh', async () => {
    const { refreshQueue } = require('../../../utils/refreshQueue');
    (refreshQueue.isDomainLocked as jest.Mock).mockImplementation(() => true);
    KeywordMock.bulkCreate.mockResolvedValue([{ ID: 52, keyword: 'alpha' }]);
    KeywordMock.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([storedRow({ ID: 52, keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' })]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(1);
    // No claim on the domain, just a task that waits its turn in the queue
    expect(refreshQueue.reserveDomains).not.toHaveBeenCalled();
    expect(refreshQueue.enqueue).toHaveBeenCalledWith(expect.stringMatching(/^addKeywords-example\.com-/), expect.any(Function), ['example.com']);
    (refreshQueue.isDomainLocked as jest.Mock).mockImplementation(() => false);
  });

it('does not treat the same keyword on another device or in another city as a duplicate', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'mobile', country: 'US' })]);

    const otherDevice = await postKeywords([newKeyword]);

    expect(otherDevice.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(1);

    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US', location: austin })]);

    const otherCity = await postKeywords([{ ...newKeyword, city: 'Denver', state: 'Colorado' }]);

    expect(otherCity.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(2);
    expect(KeywordMock.findAll).toHaveBeenCalledWith(expect.objectContaining({ attributes: expect.arrayContaining(['location']) }));
  });

it('returns 409 for the same keyword in the same city', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US', location: austin })]);

    const res = await postKeywords([{ ...newKeyword, city: 'Austin', state: 'Texas' }]);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

it('treats a null stored location and an empty one as the same target', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US', location: null })]);

    const res = await postKeywords([{ ...newKeyword, location: '' }]);

    expect(res.status).toHaveBeenCalledWith(409);
  });

it('answers 400 instead of 500 for a null body or null keyword items', async () => {
    for (const [method, body] of [['POST', null], ['PUT', null], ['POST', { keywords: [null] }]] as const) {
      const req = createMockRequest({ method, query: { id: '1' }, body });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});

describe('/api/serp/keywords concurrent duplicate insert', () => {
  it('returns 409 when the unique index rejects an insert that passed the duplicate check', async () => {
    jest.clearAllMocks();
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serper', adwords_account_id: '' });
    DomainMock.findAll.mockResolvedValue([{ get: () => ({ domain: 'example.com' }) }]);
    KeywordMock.findAll.mockResolvedValue([]);
    const uniqueError = Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
    KeywordMock.bulkCreate.mockRejectedValue(uniqueError);

    const req = createMockRequest({ method: 'POST', body: { keywords: [{ keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com' }] } });
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(409);
  });
})
