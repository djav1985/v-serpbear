import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/refresh';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getAppSettings } from '../../pages/api/settings';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), update: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('../../utils/verifyUser');

jest.mock('../../pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/scraper', () => ({
  scrapeKeywordFromGoogle: jest.fn(),
  retryScrape: jest.fn(),
  removeFromRetryQueue: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

jest.mock('../../utils/refreshQueue', () => ({
  refreshQueue: {
    enqueue: jest.fn().mockImplementation(async (_id: string, task: () => Promise<void>, _domain?: string) => {
      // Execute task immediately in tests
      await task();
    }),
    isDomainLocked: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockReturnValue({ 
      queueLength: 0, 
      activeProcesses: 0,
      activeDomains: [],
      pendingTaskIds: [],
      maxConcurrency: 3,
    }),
    setMaxConcurrency: jest.fn(),
  },
}));

describe('/api/refresh', () => {
  const req = { method: 'POST', query: {}, headers: {} } as unknown as NextApiRequest;
  let res: NextApiResponse;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    (db.sync as jest.Mock).mockResolvedValue(undefined);
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
    (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue([]);
  });

  it('rejects requests with no valid keyword IDs', async () => {
    req.query = { id: 'abc,NaN' };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No valid keyword IDs provided' });
    expect(Keyword.findAll).not.toHaveBeenCalled();
  });

  it('starts refresh in background and returns 202 immediately', async () => {
    req.query = { id: '1', domain: 'example.com' };

    const keywordRecord = { ID: 1, domain: 'example.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    (refreshAndUpdateKeywords as jest.Mock).mockRejectedValue(new Error('scraper failed'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ 
      message: 'Refresh started',
      keywordCount: 1,
    });
    expect(keywordRecord.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
  });

  it('starts bulk refresh in background and returns 202', async () => {
    req.query = { id: '1,2', domain: 'example.com' };

    const createKeywordRecord = (id: number, overrides: Record<string, any> = {}) => {
      const baseRecord = {
        ID: id,
        domain: 'example.com',
        keyword: `keyword-${id}`,
        device: 'desktop',
        country: 'US',
        lastUpdated: '',
        volume: 0,
        added: '',
        position: id,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        url: '',
        tags: '[]',
        updating: 0,
        lastUpdateError: 'false',
        mapPackTop3: 0,
        ...overrides,
      };

      return {
        ...baseRecord,
        get: jest.fn().mockReturnValue(baseRecord),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      };
    };

    const keywordRecord1 = createKeywordRecord(1);
    const keywordRecord2 = createKeywordRecord(2);

    (Keyword.findAll as jest.Mock)
      .mockResolvedValueOnce([keywordRecord1, keywordRecord2]);

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);
    const refreshedKeywords = [
      { ...keywordRecord1.get(), updating: 0 },
      { ...keywordRecord2.get(), updating: 0 },
    ];
    (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue(refreshedKeywords);

    await handler(req, res);

    // Wait for async processing to complete
    await jest.runAllTimersAsync();

    // Both keywords from same domain updated together
    expect(keywordRecord1.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
    expect(keywordRecord2.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
    expect(Keyword.findAll).toHaveBeenCalledTimes(1);
    expect(refreshAndUpdateKeywords).toHaveBeenCalledTimes(1);
    expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keywordRecord1, keywordRecord2], { scraper_type: 'serpapi' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Refresh started',
      keywordCount: 2,
    });
  });

  it('passes the requested device to keyword preview scrapes', async () => {
    const previewReq = {
      method: 'GET',
      query: { keyword: 'widgets', country: 'US', device: 'mobile' },
      headers: {},
    } as unknown as NextApiRequest;

    const previewRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    (scrapeKeywordFromGoogle as jest.Mock).mockResolvedValue({
      keyword: 'widgets',
      position: 3,
      result: [],
      mapPackTop3: false,
    });

    await handler(previewReq, previewRes);

    expect(scrapeKeywordFromGoogle).toHaveBeenCalledWith(expect.objectContaining({ device: 'mobile' }), { scraper_type: 'serpapi' });
    expect(previewRes.status).toHaveBeenCalledWith(200);
    expect(previewRes.json).toHaveBeenCalledWith({ error: '', searchResult: expect.objectContaining({ device: 'mobile' }) });
  });

  it('rejects manual refresh when domain is already locked', async () => {
    req.query = { id: '1', domain: 'example.com' };

    const keywordRecord = { ID: 1, domain: 'example.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
    ]);

    // Mock domain as locked
    const { refreshQueue } = require('../../utils/refreshQueue');
    (refreshQueue.isDomainLocked as jest.Mock).mockReturnValueOnce(true);

    await handler(req, res);

    // Should return 409 Conflict
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Domains are already being refreshed: example.com. Please wait for the current refresh to complete.',
    });

    // Should NOT enqueue or update keywords
    expect(keywordRecord.update).not.toHaveBeenCalled();
    expect(refreshQueue.enqueue).not.toHaveBeenCalled();
  });

  it('handles keywords with domains missing from Domain table', async () => {
    req.query = { id: '1,2', domain: 'missing-domain.com' };

    const keywordRecord1 = { 
      ID: 1, 
      domain: 'missing-domain.com', 
      update: jest.fn().mockResolvedValue(undefined), 
      reload: jest.fn().mockResolvedValue(undefined),
      set: jest.fn() 
    };
    const keywordRecord2 = { 
      ID: 2, 
      domain: 'missing-domain.com', 
      update: jest.fn().mockResolvedValue(undefined), 
      reload: jest.fn().mockResolvedValue(undefined),
      set: jest.fn() 
    };
    
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2]);
    // Domain table returns empty array - domain doesn't exist
    (Domain.findAll as jest.Mock).mockResolvedValue([]);

    await handler(req, res);

    // Should clear updating flags for keywords with missing domains
    expect(keywordRecord1.update).toHaveBeenCalledWith({ 
      updating: 0, 
      updatingStartedAt: null 
    });
    expect(keywordRecord2.update).toHaveBeenCalledWith({ 
      updating: 0, 
      updatingStartedAt: null 
    });

    // Should return error
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Domains not found in database: missing-domain.com. Please ensure domains are created before adding keywords.',
    });

    // Should NOT call refreshAndUpdateKeywords
    expect(refreshAndUpdateKeywords).not.toHaveBeenCalled();
  });

  it('handles mixed scenario with some domains missing and some present', async () => {
    req.query = { id: '1,2,3' };

    const keywordRecord1 = { 
      ID: 1, 
      domain: 'valid-domain.com', 
      update: jest.fn().mockResolvedValue(undefined), 
      reload: jest.fn().mockResolvedValue(undefined),
      set: jest.fn() 
    };
    const keywordRecord2 = { 
      ID: 2, 
      domain: 'missing-domain.com', 
      update: jest.fn().mockResolvedValue(undefined), 
      reload: jest.fn().mockResolvedValue(undefined),
      set: jest.fn() 
    };
    const keywordRecord3 = { 
      ID: 3, 
      domain: 'valid-domain.com', 
      update: jest.fn().mockResolvedValue(undefined), 
      reload: jest.fn().mockResolvedValue(undefined),
      set: jest.fn() 
    };
    
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2, keywordRecord3]);
    // Only valid-domain.com exists in Domain table
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'valid-domain.com', scrapeEnabled: 1 }) },
    ]);

    await handler(req, res);

    // Should clear updating flag for keyword with missing domain
    expect(keywordRecord2.update).toHaveBeenCalledWith({ 
      updating: 0, 
      updatingStartedAt: null 
    });

    // Should set updating flag for keywords with valid domain
    expect(keywordRecord1.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
    expect(keywordRecord3.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });

    // Should proceed with refresh for valid keywords
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Refresh started',
      keywordCount: 2,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
});
