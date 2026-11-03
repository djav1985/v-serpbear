import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/keywords';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { getAppSettings } from '../../pages/api/settings';
import { getKeywordsVolume } from '../../utils/adwords';
import { refreshQueue } from '../../utils/refreshQueue';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
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
jest.mock('../../utils/refresh', () => ({ __esModule: true, default: jest.fn().mockResolvedValue([]) }));
jest.mock('../../pages/api/settings', () => ({ __esModule: true, getAppSettings: jest.fn() }));
jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  getKeywordsVolume: jest.fn(),
  updateKeywordsVolumeData: jest.fn(),
}));
jest.mock('../../utils/refreshQueue', () => ({
  __esModule: true,
  refreshQueue: { enqueue: jest.fn().mockResolvedValue(undefined), isDomainLocked: jest.fn(() => false) },
}));
jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (apiHandler: any) => apiHandler }));

const KeywordMock = Keyword as unknown as { findAll: jest.Mock; bulkCreate: jest.Mock; update: jest.Mock };
const DomainMock = Domain as unknown as { findAll: jest.Mock };

const storedRow = (values: Record<string, unknown>) => ({ get: () => ({ ID: 1, history: '{}', tags: '[]', lastResult: '[]', lastUpdateError: 'false', ...values }) });

describe('/api/keywords data rules', () => {
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

  it('rejects keywords for a domain that is not tracked', async () => {
    DomainMock.findAll.mockResolvedValue([]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the same keyword is already tracked on the domain', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'desktop', country: 'US' })]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('alpha (desktop)') }) }));
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

  it('returns 409 when the same keyword appears twice in one request', async () => {
    const res = await postKeywords([newKeyword, { ...newKeyword }]);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(KeywordMock.bulkCreate).not.toHaveBeenCalled();
  });

  it('does not treat the same keyword on another device as a duplicate', async () => {
    KeywordMock.findAll.mockResolvedValueOnce([storedRow({ keyword: 'alpha', domain: 'example.com', device: 'mobile', country: 'US' })]);

    const res = await postKeywords([newKeyword]);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(KeywordMock.bulkCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a sticky update whose IDs are all invalid, and never queries them', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: 'abc,0,-3' }, body: { sticky: true } });
    const res = createMockResponse();

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(KeywordMock.update).not.toHaveBeenCalled();
    expect(refreshQueue.enqueue).not.toHaveBeenCalled();
  });

  it('drops invalid IDs from a sticky update and keeps the valid ones', async () => {
    const req = createMockRequest({ method: 'PUT', query: { id: 'abc,7' }, body: { sticky: true } });
    const res = createMockResponse();
    KeywordMock.update.mockResolvedValue([1]);
    KeywordMock.findAll.mockResolvedValueOnce([]);

    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

    expect(KeywordMock.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: { ID: expect.anything() } }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
