import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
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
  });

  it('only refreshes keywords for domains with scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
      { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
    ]);

    const keywordRecord = { domain: 'enabled.com' };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);

    await handler(req, res as NextApiResponse);

    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: 1, lastUpdateError: 'false', updatingStartedAt: '2024-06-01T12:00:00.000Z' },
      { where: { domain: { [Op.in]: ['enabled.com'] } } },
    );
    expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: ['enabled.com'] } });
    expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keywordRecord], { scraper_type: 'serpapi' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });
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

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
});
