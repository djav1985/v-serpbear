import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/cron';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getAppSettings } from '../../pages/api/settings';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { update: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../../utils/verifyUser');

jest.mock('../../pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../utils/refresh', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

jest.mock('../../utils/refreshQueue', () => ({
  refreshQueue: {
    enqueue: jest.fn().mockImplementation(async (_id: string, task: () => Promise<void>) => {
      // Execute task immediately in tests
      await task();
    }),
    getStatus: jest.fn().mockReturnValue({ queueLength: 0, isProcessing: false, pendingTaskIds: [] }),
  },
}));

type MockedResponse = Partial<NextApiResponse> & {
  status: jest.Mock;
  json: jest.Mock;
};

describe('/api/cron', () => {
  const req = { method: 'POST', headers: {} } as unknown as NextApiRequest;
  let res: MockedResponse;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as MockedResponse;

    (db.sync as jest.Mock).mockResolvedValue(undefined);
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
    (Keyword.update as jest.Mock).mockResolvedValue([1]);
    (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue([]);
  });

  it('only refreshes keywords for domains with scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    const keywordRecord = { domain: 'enabled.com' };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);

    await handler(req, res as NextApiResponse);

    // Response should be sent immediately (background processing)
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });

    // Flush all pending promises
    await jest.runAllTimersAsync();

    // Sequential processing: update and findAll called per domain
    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: 1, lastUpdateError: 'false', updatingStartedAt: '2024-06-01T12:00:00.000Z' },
      { where: { domain: 'enabled.com' } },
    );
    expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: 'enabled.com' } });
    expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keywordRecord], { scraper_type: 'serpapi' });
  });

  it('returns early when no domains have scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    await handler(req, res as NextApiResponse);

    expect(Keyword.update).not.toHaveBeenCalled();
    expect(Keyword.findAll).not.toHaveBeenCalled();
    expect(refreshAndUpdateKeywords).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: false, error: 'No domains have scraping enabled.' });
  });

  it('processes multiple domains sequentially', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'first.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'second.com', scrapeEnabled: 1 }) },
    ]);

    const firstKeyword = { domain: 'first.com', keyword: 'test1' };
    const secondKeyword = { domain: 'second.com', keyword: 'test2' };
    
    (Keyword.findAll as jest.Mock)
      .mockResolvedValueOnce([firstKeyword])
      .mockResolvedValueOnce([secondKeyword]);

    await handler(req, res as NextApiResponse);

    // Response should be sent immediately
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });

    // Flush all pending promises
    await jest.runAllTimersAsync();

    // Verify sequential processing - each domain processed separately
    expect(Keyword.update).toHaveBeenCalledTimes(2);
    expect(Keyword.update).toHaveBeenNthCalledWith(1,
      { updating: 1, lastUpdateError: 'false', updatingStartedAt: '2024-06-01T12:00:00.000Z' },
      { where: { domain: 'first.com' } },
    );
    expect(Keyword.update).toHaveBeenNthCalledWith(2,
      { updating: 1, lastUpdateError: 'false', updatingStartedAt: '2024-06-01T12:00:00.000Z' },
      { where: { domain: 'second.com' } },
    );

    expect(Keyword.findAll).toHaveBeenCalledTimes(2);
    expect(Keyword.findAll).toHaveBeenNthCalledWith(1, { where: { domain: 'first.com' } });
    expect(Keyword.findAll).toHaveBeenNthCalledWith(2, { where: { domain: 'second.com' } });

    expect(refreshAndUpdateKeywords).toHaveBeenCalledTimes(2);
    expect(refreshAndUpdateKeywords).toHaveBeenNthCalledWith(1, [firstKeyword], { scraper_type: 'serpapi' });
    expect(refreshAndUpdateKeywords).toHaveBeenNthCalledWith(2, [secondKeyword], { scraper_type: 'serpapi' });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
});
