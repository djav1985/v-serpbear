import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/insight';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../utils/searchConsole';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../utils/verifyUser');

jest.mock('../../utils/searchConsole');

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

const mockDomainFindOne = Domain.findOne as jest.MockedFunction<typeof Domain.findOne>;
const mockReadLocalSCData = readLocalSCData as jest.MockedFunction<typeof readLocalSCData>;
const mockFetchDomainSCData = fetchDomainSCData as jest.MockedFunction<typeof fetchDomainSCData>;
const mockGetSearchConsoleApiInfo = getSearchConsoleApiInfo as jest.MockedFunction<typeof getSearchConsoleApiInfo>;

describe('GET /api/insight', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;

  beforeEach(() => {
    req = {
      method: 'GET',
      query: { domain: 'example.com' },
      headers: {
        authorization: 'Bearer token',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    mockReadLocalSCData.mockResolvedValue(null);
    mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'client', private_key: 'key' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when the domain does not exist', async () => {
    mockDomainFindOne.mockResolvedValue(null as any);

    await handler(req as NextApiRequest, res as NextApiResponse);

    expect(mockDomainFindOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
    expect(mockFetchDomainSCData).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Domain not found.' });
  });
});
