import { createMockRequest, createMockResponse } from '../__helpers__';

describe('session check route', () => {
  let handler: any;
  let verifyUser: any;
  let verifySessionToken: any;
  jest.isolateModules(() => {
    jest.doMock('../../utils/logger', () => ({
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
        isSuccessLoggingEnabled: jest.fn(() => true),
      },
    }));
    jest.doMock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
    jest.doMock('../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
      verifySessionToken: jest.fn(),
    }));
    const m0 = require('../__helpers__/routeAdapter').asModule(require('../../app/api/auth/check/route'));
    handler = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../../utils/verifyUser');
    verifyUser = m1 && m1.__esModule ? m1.default : m1;
    verifySessionToken = m1.verifySessionToken;
  });

  const jwtVerifyMock = verifySessionToken as unknown as jest.Mock;
  const request = (token?: string, method = 'GET') => createMockRequest({
    method,
    cookies: token ? { token } : {},
  });

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
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      const req = request(undefined, 'POST');
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }),
      }));
    });

    it('returns 401 when verifyUser rejects', async () => {
      (verifyUser as jest.Mock).mockReturnValue('not authorized');
      const req = request();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'UNAUTHORIZED', message: 'not authorized' }),
      }));
    });

    it('returns 200 with decoded user when token is valid', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      process.env.SECRET = 'test-secret';

      jwtVerifyMock.mockReturnValue({ user: 'admin' });

      const req = request('valid-token');
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'admin', timezone: expect.any(String) });
    });

    it('falls back to the default identity when a decoded token omits its user claim', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      process.env.SECRET = 'test-secret';
      jwtVerifyMock.mockReturnValue({});
      const req = request('valid-token-without-user');
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
    });

    it('skips token decoding when the signing secret is not configured', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      delete process.env.SECRET;
      const req = request('old-token');
      const res = createMockResponse();

      await handler(req, res);

      expect(jwtVerifyMock).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
    });

    it('falls back to authenticated_user when no token is present', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      const req = request();
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
    });

    it('falls back to authenticated_user when jwt.verify throws', async () => {
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      process.env.SECRET = 'test-secret';

      jwtVerifyMock.mockImplementation(() => { throw new Error('invalid token'); });

      const req = request('bad-token');
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ authenticated: true, user: 'authenticated_user', timezone: expect.any(String) });
    });
  });
});
