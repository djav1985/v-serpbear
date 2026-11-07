import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/auth/check';
import verifyUser, { verifySessionToken } from '../../utils/verifyUser';

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
}));

jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (h: any) => h,
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
  verifySessionToken: jest.fn(),
}));

const getCookieMock = jest.fn();
jest.mock('cookies', () => ({
  __esModule: true,
  default: jest.fn(() => ({ get: getCookieMock })),
}));

const jwtVerifyMock = verifySessionToken as unknown as jest.Mock;

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
} as unknown as NextApiResponse);

describe('GET /api/auth/check', () => {
  const originalSecret = process.env.SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
  });

  it('returns 405 for non-GET requests', async () => {
    const req = { method: 'POST' } as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }),
    }));
  });

  it('returns 401 when verifyUser rejects', async () => {
    (verifyUser as jest.Mock).mockReturnValue('not authorized');
    const req = { method: 'GET' } as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'UNAUTHORIZED', message: 'not authorized' }),
    }));
  });

  it('returns 200 with decoded user when token is valid', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    getCookieMock.mockReturnValue('valid-token');
    process.env.SECRET = 'test-secret';

    jwtVerifyMock.mockReturnValue({ user: 'admin' });

    const req = { method: 'GET' } as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'admin', timezone: expect.any(String) });
  });

  it('falls back to authenticated_user when no token is present', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    getCookieMock.mockReturnValue(undefined);

    const req = { method: 'GET' } as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
  });

  it('falls back to authenticated_user when jwt.verify throws', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    getCookieMock.mockReturnValue('bad-token');
    process.env.SECRET = 'test-secret';

    jwtVerifyMock.mockImplementation(() => { throw new Error('invalid token'); });

    const req = { method: 'GET' } as NextApiRequest;
    const res = createRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
  });
});
