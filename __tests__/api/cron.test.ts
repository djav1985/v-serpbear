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

jest.mock('../../utils/refresh', () => {
  const actual = jest.requireActual('../../utils/refresh');
  return {
    __esModule: true,
    ...actual,
    default: jest.fn().mockResolvedValue([]),
  };
});

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

jest.mock('../../utils/refreshQueue', () => ({
  refreshQueue: {
    enqueue: jest.fn().mockImplementation(async (_id: string, task: () => Promise<void>, _domain?: string) => {
      // Execute task immediately in tests
      await task();
    }),
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
    (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue([]);
  });

  it('only refreshes keywords for domains with scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    const keywordRecord = { domain: 'enabled.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);

    await handler(req, res as NextApiResponse);

    // Response should be sent immediately (background processing)
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });

    // Flush all pending promises
    await jest.runAllTimersAsync();

    // Sequential processing: update and findAll called per domain
    expect(keywordRecord.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
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

    const firstKeyword = { domain: 'first.com', keyword: 'test1', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    const secondKeyword = { domain: 'second.com', keyword: 'test2', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    
    (Keyword.findAll as jest.Mock)
      .mockResolvedValueOnce([firstKeyword])
      .mockResolvedValueOnce([secondKeyword]);

    await handler(req, res as NextApiResponse);

    // Response should be sent immediately
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });

    // Flush all pending promises
    await jest.runAllTimersAsync();

    // Each domain enqueued separately (can process in parallel via queue)
    expect(firstKeyword.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });
    expect(secondKeyword.update).toHaveBeenCalledWith({
      updating: 1,
      lastUpdateError: 'false',
      updatingStartedAt: '2024-06-01T12:00:00.000Z',
    });

    expect(Keyword.findAll).toHaveBeenCalledTimes(2);
    expect(Keyword.findAll).toHaveBeenNthCalledWith(1, { where: { domain: 'first.com' } });
    expect(Keyword.findAll).toHaveBeenNthCalledWith(2, { where: { domain: 'second.com' } });

    expect(refreshAndUpdateKeywords).toHaveBeenCalledTimes(2);
    expect(refreshAndUpdateKeywords).toHaveBeenNthCalledWith(1, [firstKeyword], { scraper_type: 'serpapi' });
    expect(refreshAndUpdateKeywords).toHaveBeenNthCalledWith(2, [secondKeyword], { scraper_type: 'serpapi' });
  });

  it('generates unique task IDs for each domain using crypto.randomUUID()', async () => {
    const { refreshQueue } = require('../../utils/refreshQueue');
    
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'first.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'second.com', scrapeEnabled: 1 }) },
    ]);

    (Keyword.findAll as jest.Mock).mockResolvedValue([
      { domain: 'first.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() }
    ]);

    await handler(req, res as NextApiResponse);
    await jest.runAllTimersAsync();

    // Verify enqueue was called twice (once per domain)
    expect(refreshQueue.enqueue).toHaveBeenCalledTimes(2);

    // Extract the task IDs from the enqueue calls
    const firstCallId = (refreshQueue.enqueue as jest.Mock).mock.calls[0][0];
    const secondCallId = (refreshQueue.enqueue as jest.Mock).mock.calls[1][0];

    // Task IDs should start with "cron-refresh-{domain}-"
    expect(firstCallId).toMatch(/^cron-refresh-first\.com-[a-f0-9-]{36}$/);
    expect(secondCallId).toMatch(/^cron-refresh-second\.com-[a-f0-9-]{36}$/);

    // Task IDs should be different (unique UUIDs)
    expect(firstCallId).not.toBe(secondCallId);

    // Verify the domain parameter is passed correctly
    expect(refreshQueue.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^cron-refresh-first\.com-/),
      expect.any(Function),
      'first.com'
    );
    expect(refreshQueue.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^cron-refresh-second\.com-/),
      expect.any(Function),
      'second.com'
    );
  });

  it('generates different task IDs when same domain is enqueued multiple times', async () => {
    const { refreshQueue } = require('../../utils/refreshQueue');
    
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'test.com', scrapeEnabled: 1 }) },
    ]);

    (Keyword.findAll as jest.Mock).mockResolvedValue([
      { domain: 'test.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() }
    ]);

    // Call handler twice to simulate rapid consecutive cron triggers
    await handler(req, res as NextApiResponse);
    
    // Reset mocks but keep the enqueue calls
    const firstCallId = (refreshQueue.enqueue as jest.Mock).mock.calls[0][0];
    
    // Simulate another cron call
    const res2 = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as MockedResponse;
    
    await handler(req, res2 as NextApiResponse);
    await jest.runAllTimersAsync();

    const secondCallId = (refreshQueue.enqueue as jest.Mock).mock.calls[1][0];

    // Both should be for test.com but with different UUIDs
    expect(firstCallId).toMatch(/^cron-refresh-test\.com-/);
    expect(secondCallId).toMatch(/^cron-refresh-test\.com-/);
    expect(firstCallId).not.toBe(secondCallId);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
});
