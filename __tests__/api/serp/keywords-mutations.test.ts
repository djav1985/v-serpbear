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

describe('PUT /api/serp/keywords updates', () => {
beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
      jest.clearAllMocks();
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
    });

;

it('returns 500 when keyword update fails', async () => {
      const failure = new Error('update failed');
      keywordMock.update.mockRejectedValueOnce(failure);

      const req = {
        method: 'PUT',
        query: {},
        body: { ids: [1],  sticky: true },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      // db.sync() is now called at startup via instrumentation, not in handlers
      expect(verifyUserMock).toHaveBeenCalledWith(expect.any(Request));
      expect(keywordMock.update).toHaveBeenCalledWith({ sticky: 1 }, { where: { ID: { [Op.in]: [1] } } });
      expect(keywordMock.findAll).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'Failed to update keywords.' }),
      }));
    });

describe('PUT /api/serp/keywords tags updates', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
      jest.clearAllMocks();
      dbMock.sync.mockResolvedValue(undefined);
      verifyUserMock.mockReturnValue('authorized');
    });

    it('rejects more than 10 tags for a keyword with 400 before changing any keyword', async () => {
      const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  tags: { 1: tags } } });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(keywordMock.findAll).not.toHaveBeenCalled();
    });

    it('returns refreshed keyword data when tags are updated', async () => {
      const firstUpdate = jest.fn().mockResolvedValue(undefined);
      const secondUpdate = jest.fn().mockResolvedValue(undefined);

      // First lookup: the keywords to update (one query). Second lookup: the reloaded keywords for the response.
      keywordMock.findAll
        .mockResolvedValueOnce([{ ID: 1, update: firstUpdate }, { ID: 2, update: secondUpdate }])
        .mockResolvedValueOnce([
        {
          get: () => ({
            ID: 1,
            keyword: 'alpha',
            domain: 'example.com',
            device: 'desktop',
            country: 'US',
            location: '',
            history: '{}',
            tags: JSON.stringify(['existing', 'new']),
            lastResult: '[]',
            lastUpdateError: 'false',
            sticky: false,
            updating: false,
            mapPackTop3: false,
          }),
        },
        {
          get: () => ({
            ID: 2,
            keyword: 'beta',
            domain: 'example.com',
            device: 'desktop',
            country: 'US',
            location: '',
            history: '{}',
            tags: JSON.stringify(['second']),
            lastResult: '[]',
            lastUpdateError: 'false',
            sticky: false,
            updating: false,
            mapPackTop3: false,
          }),
        },
      ]);

      // The client always sends the full desired final tag list per keyword.
      // For add mode, the client pre-merges existing + new tags before calling the API.
      const req = {
        method: 'PUT',
        query: {},
        body: { ids: [1, 2],  tags: { 1: ['existing', 'new'], 2: ['second'] } },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(keywordMock.findAll).toHaveBeenNthCalledWith(1, { where: { ID: { [Op.in]: [1, 2] } } });
      expect(firstUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['existing', 'new']) });
      expect(secondUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['second']) });
      expect(keywordMock.findAll).toHaveBeenCalledWith({ where: { ID: { [Op.in]: [1, 2] } } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        keywords: expect.arrayContaining([
          expect.objectContaining({ keyword: 'alpha', tags: ['existing', 'new'] }),
          expect.objectContaining({ keyword: 'beta', tags: ['second'] }),
        ]),
      });
    });

    it('removes tags from multiple keywords without restoring removed tags', async () => {
      const firstUpdate = jest.fn().mockResolvedValue(undefined);
      const secondUpdate = jest.fn().mockResolvedValue(undefined);

      // findOne mocks return the current DB state (which includes the tag being removed).
      // If union-merge logic were reintroduced, 'PPC' would be added back — this test
      // would then fail, catching the regression.
      keywordMock.findAll
        .mockResolvedValueOnce([
          { ID: 3, tags: JSON.stringify(['SEO', 'PPC']), update: firstUpdate },
          { ID: 4, tags: JSON.stringify(['PPC', 'Content']), update: secondUpdate },
        ])
        .mockResolvedValueOnce([
        {
          get: () => ({
            ID: 3,
            keyword: 'gamma',
            domain: 'example.com',
            device: 'desktop',
            country: 'US',
            location: '',
            history: '{}',
            tags: JSON.stringify(['SEO']),
            lastResult: '[]',
            lastUpdateError: 'false',
            sticky: false,
            updating: false,
            mapPackTop3: false,
          }),
        },
        {
          get: () => ({
            ID: 4,
            keyword: 'delta',
            domain: 'example.com',
            device: 'desktop',
            country: 'US',
            location: '',
            history: '{}',
            tags: JSON.stringify(['Content']),
            lastResult: '[]',
            lastUpdateError: 'false',
            sticky: false,
            updating: false,
            mapPackTop3: false,
          }),
        },
      ]);

      // The client computes the final tag list with the removed tag already filtered out.
      // Keyword 3 had ['SEO', 'PPC'], keyword 4 had ['PPC', 'Content']. Removing 'PPC'.
      const req = {
        method: 'PUT',
        query: {},
        body: { ids: [3, 4],  tags: { 3: ['SEO'], 4: ['Content'] } },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      // 'PPC' must NOT be restored – the API saves exactly what the client sends.
      expect(firstUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['SEO']) });
      expect(secondUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['Content']) });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        keywords: expect.arrayContaining([
          expect.objectContaining({ keyword: 'gamma', tags: ['SEO'] }),
          expect.objectContaining({ keyword: 'delta', tags: ['Content'] }),
        ]),
      });
    });

    it('treats an empty tags object as a successful no-op', async () => {
      const req = {
        method: 'PUT',
        query: {},
        body: { ids: [1],  tags: {} },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(keywordMock.findOne).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ keywords: [] });
    });

    it('clears persisted tags when provided with empty arrays', async () => {
      const updateSpy = jest.fn().mockResolvedValue(undefined);
      keywordMock.findAll.mockResolvedValueOnce([{ ID: 5, tags: JSON.stringify(['keep']), update: updateSpy }]);
      keywordMock.findAll.mockResolvedValueOnce([
        {
          get: () => ({
            ID: 5,
            keyword: 'gamma',
            domain: 'example.com',
            device: 'desktop',
            country: 'US',
            location: '',
            history: '{}',
            tags: JSON.stringify([]),
            lastResult: '[]',
            lastUpdateError: 'false',
            sticky: false,
            updating: false,
            mapPackTop3: false,
          }),
        },
      ]);

      const req = {
        method: 'PUT',
        query: {},
        body: { ids: [5],  tags: { 5: [] } },
        headers: {},
      } as unknown as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(updateSpy).toHaveBeenCalledWith({ tags: JSON.stringify([]) });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        keywords: expect.arrayContaining([
          expect.objectContaining({ keyword: 'gamma', tags: [] }),
        ]),
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });
  })

describe('PUT /api/serp/keywords location updates', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Drop lookups queued by an earlier test that stopped before using them
      keywordMock.findAll.mockReset();
      dbMock.sync.mockResolvedValue(undefined);
      verifyUserMock.mockReturnValue('authorized');
    });

    const locationRow = (overrides: Record<string, unknown> = {}) => {
      const plain = {
        ID: 1,
        keyword: 'alpha',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'Austin,TX,US',
        history: '{}',
        tags: '[]',
        lastResult: '[]',
        lastUpdateError: 'false',
        sticky: false,
        updating: false,
        mapPackTop3: false,
        ...overrides,
      };
      return { ...plain, get: () => plain };
    };

    // Lookups run in order: the selected keywords (to find their domains), the same keywords again once the domains
    // are claimed, the other tracked keywords on those domains, the moved rows for the refresh, then the response rows
    const mockLocationLookups = (selected: object[], others: object[] = []) => {
      keywordMock.findAll
        .mockResolvedValueOnce(selected)
        .mockResolvedValueOnce(selected)
        .mockResolvedValueOnce(others)
        .mockResolvedValueOnce(selected)
        .mockResolvedValueOnce(selected);
    };

    it('applies one location to every keyword in the ID list', async () => {
      keywordMock.update.mockResolvedValue([2]);
      mockLocationLookups([locationRow({ ID: 1 }), locationRow({ ID: 2, keyword: 'beta' })]);
      const req = createMockRequest({
        method: 'PUT',
        query: {},
        body: { ids: [1, 2],  location: '  Austin,TX,United States  ', country: 'US' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'Austin,TX,United States', country: 'US', position: 0, history: '{}', updating: 0 }),
        { where: { ID: { [Op.in]: [1, 2] } }, transaction: expect.anything() },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 2, skipped: [] }));
    });

    it('saves a blank location for a country-only choice', async () => {
      keywordMock.update.mockResolvedValue([1]);
      mockLocationLookups([locationRow()]);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: '', country: 'DE' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ location: '', country: 'DE', position: 0, history: '{}', updating: 0 }),
        { where: { ID: { [Op.in]: [1] } }, transaction: expect.anything() },
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('clears its updating flags before releasing the domain when enqueue fails', async () => {
      const { clearKeywordUpdatingFlags } = require('../../../utils/refresh');
      const row = locationRow();
      const release = jest.fn(() => expect(clearKeywordUpdatingFlags).toHaveBeenCalled());
      refreshQueueMock.reserveDomains.mockReturnValueOnce(release);
      refreshQueueMock.enqueue.mockRejectedValueOnce(new Error('enqueue failed'));
      mockLocationLookups([row]);
      const res = createMockResponse();

      await handler(createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: '', country: 'DE' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(clearKeywordUpdatingFlags).toHaveBeenCalledWith([row], 'after location enqueue failure', { keywordIds: [1] }, true);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('clears the old rankings of a moved keyword, drops it from the retry queue and queues a fresh scrape that takes over the domain claim', async () => {
      const { retryQueueManager } = require('../../../utils/retryQueueManager');
      const { refreshKeywordsByIds } = require('../../../utils/refresh');
      keywordMock.update.mockResolvedValue([1]);
      mockLocationLookups([locationRow({ ID: 1, domain: 'example.com' })]);
      const release = jest.fn();
      (refreshQueue as any).reserveDomains.mockReturnValueOnce(release);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'Miami,Florida,United States' } });
      const res = createMockResponse();
      const settings = { scraper_type: 'serpapi' };
      getAppSettingsMock.mockResolvedValue(settings);

      await handler(req, res);

      expect(refreshQueue.reserveDomains).toHaveBeenCalledWith(['example.com']);
      expect(keywordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ position: 0, url: '', history: '{}', history7d: null, lastResult: '[]', mapPackTop3: 0, localResults: '[]' }),
        { where: { ID: { [Op.in]: [1] } }, transaction: expect.anything() },
      );
      expect(retryQueueManager.removeBatch).toHaveBeenCalledWith(new Set([1]));
      expect(updateDomainStats).toHaveBeenCalledWith('example.com');
      // The queued task takes the claim over instead of the route releasing it
      expect(refreshQueueMock.enqueue).toHaveBeenCalledWith(expect.stringMatching(/^location-refresh-1-/), expect.any(Function), ['example.com'], { reservations: [release] });
      expect(release).not.toHaveBeenCalled();
      await (refreshQueueMock.enqueue.mock.calls[0][1] as () => Promise<void>)();
      expect(refreshKeywordsByIds).toHaveBeenCalledWith([1], settings);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 1 }));
    });

    it('leaves a keyword that already has the chosen location untouched and releases the domain claim', async () => {
      const release = jest.fn();
      (refreshQueue as any).reserveDomains.mockReturnValueOnce(release);
      mockLocationLookups([locationRow({ ID: 1, location: 'Miami,Florida,United States', country: 'US' })]);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'Miami,Florida,United States' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).not.toHaveBeenCalled();
      expect(refreshQueueMock.enqueue).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 0 }));
    });

    it('returns 409 with a retry message and changes nothing while a refresh holds the domain', async () => {
      refreshQueueMock.isDomainLocked.mockImplementation((domain?: string) => domain === 'example.com');
      (refreshQueue as any).reserveDomains.mockReturnValueOnce(null);
      keywordMock.findAll.mockResolvedValueOnce([locationRow({ ID: 1, domain: 'example.com' })]);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'Miami,Florida,United States' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).toMatch(/example\.com.*Try again once the refresh has finished/);
      expect(keywordMock.update).not.toHaveBeenCalled();
      expect(refreshQueueMock.enqueue).not.toHaveBeenCalled();
      refreshQueueMock.isDomainLocked.mockImplementation(() => false);
    });

    it('returns 400 and changes nothing when no country can be determined from a blank location or from location alone', async () => {
      for (const body of [{ location: '   ' }, { location: 'Austin,TX' }]) {
        const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1], ...body } });
        const res = createMockResponse();

        await handler(req, res);

        expect(keywordMock.update).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
      }
    });

    it('returns 500 when the location update fails', async () => {
      keywordMock.update.mockRejectedValueOnce(new Error('db down'));
      mockLocationLookups([locationRow()]);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'US' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('sets the keyword country to the country of the chosen location', async () => {
      keywordMock.update.mockResolvedValue([1]);
      mockLocationLookups([locationRow()]);
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'London,England,United Kingdom' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'London,England,United Kingdom', country: 'GB', position: 0, history: '{}', updating: 0 }),
        { where: { ID: { [Op.in]: [1] } }, transaction: expect.anything() },
      );
    });

    it('skips a keyword whose new location is already tracked and updates the rest', async () => {
      keywordMock.update.mockResolvedValue([1]);
      mockLocationLookups(
        [locationRow({ ID: 1, keyword: 'alpha' }), locationRow({ ID: 2, keyword: 'beta' })],
        [locationRow({ ID: 9, keyword: 'alpha', country: 'GB', location: 'London,England,United Kingdom' })],
      );
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1, 2],  location: 'London,England,United Kingdom' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).toHaveBeenCalledTimes(2);
      expect(keywordMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'London,England,United Kingdom', country: 'GB', position: 0, history: '{}', updating: 0 }),
        { where: { ID: { [Op.in]: [2] } }, transaction: expect.anything() },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 1, skipped: ['alpha'] }));
    });

    it('changes nothing when every selected keyword would duplicate a tracked one', async () => {
      mockLocationLookups(
        [locationRow({ ID: 1, keyword: 'alpha' })],
        [locationRow({ ID: 9, keyword: 'alpha', country: 'GB', location: 'London,England,United Kingdom' })],
      );
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'London,England,GB' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 0, skipped: ['alpha'] }));
    });

    it('skips a same-country update when the destination location is already tracked', async () => {
      mockLocationLookups(
        [locationRow({ ID: 1, location: 'Miami,Florida,United States' })],
        [locationRow({ ID: 9, country: 'US', location: 'Orlando,Florida,United States' })],
      );
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  location: 'Orlando,Florida,United States' } });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 0, skipped: ['alpha'] }));
    });
  })

afterEach(() => {
      jest.useRealTimers();
    });
});

describe('PUT /api/serp/keywords data rules', () => {
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

it('rejects a sticky update whose IDs are all invalid, and never queries them', async () => {
    const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: ['abc', 0, '-3'],  sticky: true } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(KeywordMock.update).not.toHaveBeenCalled();
    expect(refreshQueue.enqueue).not.toHaveBeenCalled();
  });

it('rejects malformed keyword IDs in the JSON body', async () => {
    for (const id of ['abc,7', '12abc', '1.5', '1e3']) {
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [id],  sticky: true } });
      const res = createMockResponse();

      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(KeywordMock.update).not.toHaveBeenCalled();
    }
  });

it('accepts keyword IDs in the JSON body', async () => {
    const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [7, 8],  sticky: true } });
    const res = createMockResponse();
    KeywordMock.update.mockResolvedValue([1]);
    KeywordMock.findAll.mockResolvedValueOnce([]);

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(KeywordMock.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { ID: expect.anything() } }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

it('rejects tag keys that are not canonical integers', async () => {
    for (const key of ['1.0', '01', 'abc', '1e1']) {
      const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  tags: { [key]: ['x'] } } });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(KeywordMock.findAll).not.toHaveBeenCalled();
  });

it.each([
    [{ sticky: 'true' }, 'sticky must be true or false.'],
    [{ tags: [] }, 'Invalid Payload!'],
    [{ tags: { 1: Array.from({ length: 21 }, (_, index) => `tag-${index}`) } }, 'A keyword can have at most'],
    [{}, 'Keyword update payload is required.'],
  ])('rejects malformed keyword update payloads before writing (%p)', async (body, message) => {
    const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1], ...body } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining(message) }) }));
    expect(KeywordMock.update).not.toHaveBeenCalled();
  });

it('sanitizes and persists tags for the matching tracked keyword', async () => {
    const updated = jest.fn().mockResolvedValue(undefined);
    const row = { ID: 1, keyword: 'alpha', domain: 'example.com', update: updated, get: () => ({ ID: 1, keyword: 'alpha', domain: 'example.com', tags: '["seo"]' }) };
    KeywordMock.findAll.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);
    const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1],  tags: { 1: [' seo ', 'seo', '', 'content'] } } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(updated).toHaveBeenCalledWith({ tags: '["content","seo"]' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

it.each([
    [{ location: 'Austin' }, 'Country is required!'],
    [{ location: 'Austin', country: 'US' }, 'City and state must be provided together.'],
  ])('rejects a location change that does not identify a complete target (%p)', async (body, message) => {
    const req = createMockRequest({ method: 'PUT', query: {}, body: { ids: [1], ...body } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining(message) }) }));
    expect(KeywordMock.update).not.toHaveBeenCalled();
  });
});


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
