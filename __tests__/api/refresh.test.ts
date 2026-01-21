import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
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

describe('/api/refresh', () => {
  const req = { method: 'POST', query: {}, headers: {} } as unknown as NextApiRequest;
  let res: NextApiResponse;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    jest.clearAllMocks();

    (db.sync as jest.Mock).mockResolvedValue(undefined);
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
    (Keyword.update as jest.Mock).mockResolvedValue([1]);
  });

  it('rejects requests with no valid keyword IDs', async () => {
    req.query = { id: 'abc,NaN' };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No valid keyword IDs provided' });
    expect(Keyword.findAll).not.toHaveBeenCalled();
  });

  it('returns serialized scraper errors from refreshAndUpdateKeywords', async () => {
    req.query = { id: '1', domain: 'example.com' };

    const keywordRecord = { ID: 1, domain: 'example.com' };
    (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
    ]);

    (refreshAndUpdateKeywords as jest.Mock).mockRejectedValue(new Error('scraper failed'));

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'scraper failed' });
    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: true },
      { where: { ID: { [Op.in]: [1] } } },
    );
  });

  it('returns multi keyword refresh response with updating flag set to true', async () => {
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
      };
    };

    const keywordRecord1 = createKeywordRecord(1);
    const keywordRecord2 = createKeywordRecord(2, { domain: 'example.org', country: 'GB' });

    (Keyword.findAll as jest.Mock)
      .mockResolvedValueOnce([keywordRecord1, keywordRecord2])
      .mockResolvedValueOnce([
        createKeywordRecord(1, { updating: 1 }),
        createKeywordRecord(2, { domain: 'example.org', country: 'GB', updating: 1 }),
      ]);

    (Domain.findAll as jest.Mock).mockResolvedValue([
      { get: () => ({ domain: 'example.com', scrapeEnabled: true }) },
      { get: () => ({ domain: 'example.org', scrapeEnabled: true }) },
    ]);
    (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue([]);

    await handler(req, res);

    expect(Keyword.update).toHaveBeenCalledWith(
      { updating: true },
      { where: { ID: { [Op.in]: [1, 2] } } },
    );
    expect(Keyword.findAll).toHaveBeenCalledTimes(2);
    expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([
      keywordRecord1,
      keywordRecord2,
    ], { scraper_type: 'serpapi' });
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonResponse = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonResponse.keywords).toHaveLength(2);
    expect(jsonResponse.keywords).toEqual(expect.arrayContaining([
      expect.objectContaining({ ID: 1, updating: true }),
      expect.objectContaining({ ID: 2, updating: true }),
    ]));
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
});
