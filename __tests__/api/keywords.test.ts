import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import handler from '../../pages/api/keywords';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../pages/api/settings';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';
import { refreshQueue } from '../../utils/refreshQueue';
import { updateDomainStats } from '../../utils/updateDomainStats';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
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

// Every domain a request names exists, so keywords can be added to it
jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: { where: { domain: string[] } }) => (
      where.domain.map((name: string) => ({ get: () => ({ domain: name }) }))
    )),
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

jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined) },
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

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (handler: any) => handler,
}));

jest.mock('../../utils/updateDomainStats', () => ({
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
const refreshQueueMock = refreshQueue as unknown as { enqueue: jest.Mock; isDomainLocked: jest.Mock };

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

  it('rejects a non-boolean sticky value with 400 and leaves the keyword unchanged', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { sticky: 'true' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(keywordMock.update).not.toHaveBeenCalled();
  });

  it('rejects a request that mixes sticky, tags or location, instead of ignoring part of it', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { sticky: true, tags: { 1: ['a'] } } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(keywordMock.update).not.toHaveBeenCalled();
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ message: 'Failed to update keywords.' }),
    }));
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
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve();
    }
    expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 100 });
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
    ]);
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

describe('GET /api/keywords history7d backfill', () => {
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
      { where: { ID: 6 } },
    );
  });
});

describe('PUT /api/keywords tags updates', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    jest.clearAllMocks();
    dbMock.sync.mockResolvedValue(undefined);
    verifyUserMock.mockReturnValue('authorized');
  });

  it('rejects more than 10 tags for a keyword with 400 before changing any keyword', async () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { tags: { 1: tags } } });
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
      query: { id: '1,2' },
      body: { tags: { 1: ['existing', 'new'], 2: ['second'] } },
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
      query: { id: '3,4' },
      body: { tags: { 3: ['SEO'], 4: ['Content'] } },
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
    expect(res.json).toHaveBeenCalledWith({
      keywords: expect.arrayContaining([
        expect.objectContaining({ keyword: 'gamma', tags: [] }),
      ]),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});


describe('PUT /api/keywords location updates', () => {
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

  // Lookups run in order: the selected keywords, the other tracked keywords on those domains, then the refreshed rows
  const mockLocationLookups = (selected: object[], others: object[] = []) => {
    keywordMock.findAll
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce(others)
      .mockResolvedValueOnce(selected);
  };

  it('applies one location to every keyword in the ID list', async () => {
    keywordMock.update.mockResolvedValue([2]);
    mockLocationLookups([locationRow({ ID: 1 }), locationRow({ ID: 2, keyword: 'beta' })]);
    const req = createMockRequest({
      method: 'PUT',
      query: { id: '1,2' },
      body: { location: '  Austin,TX,United States  ', country: 'US' },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(keywordMock.update).toHaveBeenCalledWith(
      { location: 'Austin,TX,United States', country: 'US' },
      { where: { ID: { [Op.in]: [1, 2] } } },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 2, skipped: [] }));
  });

  it('rejects location updates while any selected domain is refreshing', async () => {
    const selected = [locationRow()];
    keywordMock.findAll.mockResolvedValueOnce(selected);
    (refreshQueue.reserveDomains as jest.Mock).mockReturnValueOnce(null);
    (refreshQueue.isDomainLocked as jest.Mock).mockReturnValueOnce(true);
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'London,England,United Kingdom' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(keywordMock.update).not.toHaveBeenCalled();
    expect(keywordMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('saves a blank location for a country-only choice', async () => {
    keywordMock.update.mockResolvedValue([1]);
    mockLocationLookups([locationRow()]);
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: '', country: 'DE' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(keywordMock.update).toHaveBeenCalledWith(
      { location: '', country: 'DE' },
      { where: { ID: { [Op.in]: [1] } } },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 400 and changes nothing when no country can be determined from a blank location or from location alone', async () => {
    for (const body of [{ location: '   ' }, { location: 'Austin,TX' }]) {
      const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body });
      const res = createMockResponse();

      await handler(req, res);

      expect(keywordMock.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  it('returns 500 when the location update fails', async () => {
    keywordMock.update.mockRejectedValueOnce(new Error('db down'));
    mockLocationLookups([locationRow()]);
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'US' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('sets the keyword country to the country of the chosen location', async () => {
    keywordMock.update.mockResolvedValue([1]);
    mockLocationLookups([locationRow()]);
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'London,England,United Kingdom' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(keywordMock.update).toHaveBeenCalledWith(
      { location: 'London,England,United Kingdom', country: 'GB' },
      { where: { ID: { [Op.in]: [1] } } },
    );
  });

  it('skips a keyword whose new location is already tracked and updates the rest', async () => {
    keywordMock.update.mockResolvedValue([1]);
    mockLocationLookups(
      [locationRow({ ID: 1, keyword: 'alpha' }), locationRow({ ID: 2, keyword: 'beta' })],
      [locationRow({ ID: 9, keyword: 'alpha', country: 'GB', location: 'London,England,United Kingdom' })],
    );
    const req = createMockRequest({ method: 'PUT', query: { id: '1,2' }, body: { location: 'London,England,United Kingdom' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(keywordMock.update).toHaveBeenCalledTimes(1);
    expect(keywordMock.update).toHaveBeenCalledWith(
      { location: 'London,England,United Kingdom', country: 'GB' },
      { where: { ID: { [Op.in]: [2] } } },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 1, skipped: ['alpha'] }));
  });

  it('changes nothing when every selected keyword would duplicate a tracked one', async () => {
    mockLocationLookups(
      [locationRow({ ID: 1, keyword: 'alpha' })],
      [locationRow({ ID: 9, keyword: 'alpha', country: 'GB', location: 'London,England,United Kingdom' })],
    );
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'London,England,GB' } });
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
    const req = createMockRequest({ method: 'PUT', query: { id: '1' }, body: { location: 'Orlando,Florida,United States' } });
    const res = createMockResponse();

    await handler(req, res);

    expect(keywordMock.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updatedCount: 0, skipped: ['alpha'] }));
  });
});

describe('DELETE /api/keywords retry queue cleanup', () => {
  it('removes deleted keyword IDs from the query or the JSON body from the retry queue, and rejects non-integer body IDs', async () => {
    const { retryQueueManager } = require('../../utils/retryQueueManager');
    (updateDomainStats as jest.Mock).mockClear();
    verifyUserMock.mockReturnValue('authorized');
    keywordMock.findAll.mockResolvedValue([{ ID: 1, domain: 'example.com' }, { ID: 2, domain: 'example.com' }]);
    keywordMock.destroy.mockResolvedValue(2);

    const req = { method: 'DELETE', query: { id: '1,2' }, headers: {} } as unknown as NextApiRequest;
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

    const req = { method: 'DELETE', query: { id: '1,2,3' }, headers: {} } as unknown as NextApiRequest;
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

    const req = { method: 'DELETE', query: { id: '9' }, headers: {} } as unknown as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);

    expect(keywordMock.destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
