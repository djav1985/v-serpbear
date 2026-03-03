import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import handler from '../../pages/api/keywords';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../pages/api/settings';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
  },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  getKeywordsVolume: jest.fn(),
  updateKeywordsVolumeData: jest.fn(),
}));

jest.mock('../../scrapers/index', () => ({
  __esModule: true,
  default: [],
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (handler: any) => handler,
}));

const dbMock = db as unknown as { sync: jest.Mock };
const keywordMock = Keyword as unknown as {
  update: jest.Mock;
  findAll: jest.Mock;
  findAndCountAll: jest.Mock;
  findOne: jest.Mock;
  bulkCreate: jest.Mock;
  destroy: jest.Mock;
  count: jest.Mock;
};
const verifyUserMock = verifyUser as unknown as jest.Mock;
const getAppSettingsMock = getAppSettings as unknown as jest.Mock;
const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;
const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

describe('PUT /api/keywords error handling', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
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

  it('returns 500 when keyword update fails', async () => {
    const failure = new Error('update failed');
    keywordMock.update.mockRejectedValueOnce(failure);

    const req = {
      method: 'PUT',
      query: { id: '1' },
      body: { sticky: true },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    // db.sync() is now called at startup via instrumentation, not in handlers
    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(keywordMock.update).toHaveBeenCalledWith({ sticky: 1 }, { where: { ID: { [Op.in]: [1] } } });
    expect(keywordMock.findAll).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update keywords.', details: 'update failed' });
  });

  it('returns 500 when keyword volume update fails after creation', async () => {
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

    await handler(req, res);

    expect(keywordMock.bulkCreate).toHaveBeenCalled();
    expect(getAppSettingsMock).toHaveBeenCalled();
    expect(getKeywordsVolumeMock).toHaveBeenCalled();
    expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 100 });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to add keywords.', details: 'volume failure' });
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
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'Keywords array is required', 
      details: 'Request body must contain a keywords array' 
    });
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

    await handler(req, res);

    expect(keywordMock.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        tags: JSON.stringify(['Primary', 'secondary']),
        updatingStartedAt: now,
      }),
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns keywords without invoking stale update cleanup', async () => {
    const keywordRecord = {
      get: () => ({
        ID: 5,
        keyword: 'alpha',
        history: '{}',
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

    keywordMock.findAndCountAll.mockResolvedValueOnce({ count: 1, rows: [keywordRecord] });
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

    expect(res.status).toHaveBeenCalledWith(200);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});

describe('PUT /api/keywords tags updates', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    jest.clearAllMocks();
    dbMock.sync.mockResolvedValue(undefined);
    verifyUserMock.mockReturnValue('authorized');
  });

  it('returns refreshed keyword data when tags are updated', async () => {
    const firstUpdate = jest.fn().mockResolvedValue(undefined);
    const secondUpdate = jest.fn().mockResolvedValue(undefined);

    keywordMock.findOne
      .mockResolvedValueOnce({ tags: JSON.stringify(['existing']), update: firstUpdate })
      .mockResolvedValueOnce({ tags: JSON.stringify([]), update: secondUpdate });

    keywordMock.findAll.mockResolvedValueOnce([
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

    const req = {
      method: 'PUT',
      query: { id: '1,2' },
      body: { tags: { 1: ['new'], 2: ['second'] } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.findOne).toHaveBeenNthCalledWith(1, { where: { ID: 1 } });
    expect(keywordMock.findOne).toHaveBeenNthCalledWith(2, { where: { ID: 2 } });
    expect(firstUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['existing', 'new']) });
    expect(secondUpdate).toHaveBeenCalledWith({ tags: JSON.stringify(['second']) });
    expect(keywordMock.findAll).toHaveBeenCalledWith({ where: { ID: { [Op.in]: [1, 2] } } });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(payload.keywords)).toBe(true);
  });

  it('treats an empty tags object as a successful no-op', async () => {
    const req = {
      method: 'PUT',
      query: { id: '1' },
      body: { tags: {} },
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
    keywordMock.findOne.mockResolvedValueOnce({ tags: JSON.stringify(['keep']), update: updateSpy });
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
      query: { id: '5' },
      body: { tags: { 5: [] } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(updateSpy).toHaveBeenCalledWith({ tags: JSON.stringify([]) });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(payload.keywords)).toBe(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});


describe('GET /api/keywords pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
    getAppSettingsMock.mockResolvedValue({});
  });

  it('returns paginated metadata and compact history payload', async () => {
    keywordMock.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{
        get: () => ({
          ID: 1, keyword: 'alpha', device: 'desktop', country: 'US', domain: 'example.com',
          lastUpdated: '2024-01-02T00:00:00.000Z', added: '2024-01-01T00:00:00.000Z', position: 1, volume: 0,
          sticky: 0, updating: 0, mapPackTop3: 0, location: '', history: JSON.stringify({ '2024-01-01': 4, '2024-01-02': 3 }),
          history7d: JSON.stringify({ '2024-01-02': 3 }), lastResult: JSON.stringify([{ position: 1 }]),
          tags: '[]', url: '', lastUpdateError: 'false', localResults: '[]',
        }),
      }],
    });

    const req = { method: 'GET', query: { domain: 'example.com', limit: '10', offset: '5' }, headers: {} } as unknown as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

    await handler(req, res);

    expect(keywordMock.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 5 }));
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.total).toBe(1);
    expect(payload.limit).toBe(10);
    expect(payload.offset).toBe(5);
    expect(payload.keywords[0].history).toEqual({ '2024-01-02': 3 });
    expect(payload.keywords[0].lastResult).toEqual([]);
  });
  it('falls back to parsed history when compact history is absent', async () => {
    keywordMock.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{
        get: () => ({
          ID: 2, keyword: 'beta', device: 'desktop', country: 'US', domain: 'example.com',
          lastUpdated: '2024-01-02T00:00:00.000Z', added: '2024-01-01T00:00:00.000Z', position: 1, volume: 0,
          sticky: 0, updating: 0, mapPackTop3: 0, location: '',
          history: JSON.stringify({ '2024-01-01': 5, '2024-01-02': 4, '2024-01-03': 3, '2024-01-04': 2, '2024-01-05': 1, '2024-01-06': 2, '2024-01-07': 3, '2024-01-08': 4 }),
          history7d: null, lastResult: '[]', tags: '[]', url: '', lastUpdateError: 'false', localResults: '[]',
        }),
      }],
    });

    const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

    await handler(req, res);

    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(Object.keys(payload.keywords[0].history)).toHaveLength(7);
  });

});
