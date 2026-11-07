import type { NextApiRequest } from 'next';
import handler from '../../pages/api/keyword';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

const verifyUserMock = verifyUser as unknown as jest.Mock;
const KeywordMock = Keyword as unknown as { findOne: jest.Mock };

describe('GET /api/keyword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
  });

  it('rejects malformed ids with 400', async () => {
    for (const id of ['12abc', '1.5', '-3', '0', '1e2', ' ']) {
      const res = createMockResponse();
      await handler({ method: 'GET', query: { id }, headers: {} } as unknown as NextApiRequest, res);

      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(KeywordMock.findOne).not.toHaveBeenCalled();
  });

  it('looks up a plain integer id', async () => {
    KeywordMock.findOne.mockResolvedValue(null);
    const res = createMockResponse();
    await handler({ method: 'GET', query: { id: '12' }, headers: {} } as unknown as NextApiRequest, res);

    expect(KeywordMock.findOne).toHaveBeenCalledWith({ where: { ID: 12 } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
