import { Op } from 'sequelize';
import type { NextApiRequest, NextApiResponse } from 'next';
import { buildStoredLocation } from '../../utils/location';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/serp/keywords/route';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../utils/appSettings';
import { getKeywordsVolume } from '../../utils/adwords';
import { refreshQueue } from '../../utils/refreshQueue';
import { updateDomainStats } from '../../utils/updateDomainStats';
import { createMockRequest, createMockResponse } from '../__helpers__';
const handler = asHandler(handlerRoute);

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn(), transaction: jest.fn(async (_options, work) => work({ id: "tx" })) },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), bulkCreate: jest.fn(), update: jest.fn(), destroy: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue([]),
  refreshKeywordsByIds: jest.fn().mockResolvedValue([]),
  markKeywordsAsUpdating: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/appSettings', () => ({ __esModule: true, getAppSettings: jest.fn() }));
jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  getKeywordsVolume: jest.fn(),
  updateKeywordsVolumeData: jest.fn(),
}));
jest.mock('../../utils/refreshQueue', () => ({
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
jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('../../utils/updateDomainStats', () => ({ __esModule: true, updateDomainStats: jest.fn().mockResolvedValue(undefined) }));

const KeywordMock = Keyword as unknown as { findAll: jest.Mock; bulkCreate: jest.Mock; update: jest.Mock };
const DomainMock = Domain as unknown as { findAll: jest.Mock };

const austin = buildStoredLocation({ city: 'Austin', state: 'Texas', countryCode: 'US' });
const storedRow = (values: Record<string, unknown>) => ({ get: () => ({ ID: 1, history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', ...values }) });

describe('/api/serp/keywords data rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serper', adwords_account_id: '' });
    (getKeywordsVolume as jest.Mock).mockResolvedValue({ volumes: false });
    DomainMock.findAll.mockResolvedValue([{ get: () => ({ domain: 'example.com' }) }]);
    KeywordMock.findAll.mockResolvedValue([]);
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
    const { refreshQueue } = require('../../utils/refreshQueue');
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

  it('rejects a sticky update whose IDs are all invalid, and never queries them', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: 'abc,0,-3' }, body: { sticky: true } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(KeywordMock.update).not.toHaveBeenCalled();
    expect(refreshQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a legacy id query with a malformed item', async () => {
    for (const id of ['abc,7', '12abc', '1.5', '1e3']) {
      const req = createMockRequest({ method: 'PUT', query: { id }, body: { sticky: true } });
      const res = createMockResponse();

      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(KeywordMock.update).not.toHaveBeenCalled();
    }
  });

  it('accepts a legacy id query made of plain positive integers', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: '7,8' }, body: { sticky: true } });
    const res = createMockResponse();
    KeywordMock.update.mockResolvedValue([1]);
    KeywordMock.findAll.mockResolvedValueOnce([]);

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(KeywordMock.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { ID: expect.anything() } }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('answers 400 instead of 500 for a null body or null keyword items', async () => {
    for (const [method, body] of [['POST', null], ['PUT', null], ['POST', { keywords: [null] }]] as const) {
      const req = createMockRequest({ method, query: { id: '1' }, body });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  it('rejects tag keys that are not canonical integers', async () => {
    for (const key of ['1.0', '01', 'abc', '1e1']) {
      const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { tags: { [key]: ['x'] } } });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(KeywordMock.findAll).not.toHaveBeenCalled();
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
});
