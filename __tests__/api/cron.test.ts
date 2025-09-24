import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import handler from '../../app/pages/api/cron';
import db from '../../app/database/database';
import Domain from '../../app/database/models/domain';
import Keyword from '../../app/database/models/keyword';
import verifyUser from '../../app/utils/verifyUser';
import refreshAndUpdateKeywords from '../../app/utils/refresh';
import { getAppSettings } from '../../app/pages/api/settings';

jest.mock('../../app/database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../app/database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('../../app/database/models/keyword', () => ({
  __esModule: true,
  default: { update: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../../app/utils/verifyUser');

jest.mock('../../app/pages/api/settings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

jest.mock('../../app/utils/refresh', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type MockedResponse = Partial<NextApiResponse> & {
  status: jest.Mock;
  json: jest.Mock;
};

describe('/api/cron', () => {
  const req = { method: 'POST', headers: {} } as unknown as NextApiRequest;
  let res: MockedResponse;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as MockedResponse;

    jest.clearAllMocks();

    (db.sync as jest.Mock).mockResolvedValue(undefined);
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
    (Keyword.update as jest.Mock).mockResolvedValue([1]);
  });

  it('only refreshes keywords for domains with scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'enabled.com', scrape_enabled: true }) },
      { get: () => ({ domain: 'disabled.com', scrape_enabled: false }) },
    ]);

    const keywordRecord = { domain: 'enabled.com' };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);

    await handler(req, res as NextApiResponse);

    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: true },
      { where: { domain: { [Op.in]: ['enabled.com'] } } },
    );
    expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: ['enabled.com'] } });
    expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keywordRecord], { scraper_type: 'serpapi' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: true });
  });

  it('returns early when no domains have scraping enabled', async () => {
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'disabled.com', scrape_enabled: false }) },
    ]);

    await handler(req, res as NextApiResponse);

    expect(Keyword.update).not.toHaveBeenCalled();
    expect(Keyword.findAll).not.toHaveBeenCalled();
    expect(refreshAndUpdateKeywords).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ started: false, error: 'No domains have scraping enabled.' });
  });
});
