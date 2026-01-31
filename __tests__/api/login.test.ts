import type { NextApiRequest, NextApiResponse } from 'next';
import loginHandler from '../../pages/api/login';
import logoutHandler from '../../pages/api/logout';
import verifyUser from '../../utils/verifyUser';
import Cookies from 'cookies';

// Mock the logger to prevent console output during tests
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

// Mock the API logging middleware
jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

type MutableEnv = typeof process.env & {
   USER?: string;
   USER_NAME?: string;
   PASSWORD?: string;
   SECRET?: string;
   SESSION_DURATION?: string;
};

const setCookieMock = jest.fn();

jest.mock('cookies', () => ({
   __esModule: true,
   default: jest.fn(() => ({ set: setCookieMock })),
}));

jest.mock('../../utils/verifyUser', () => ({
   __esModule: true,
   default: jest.fn(),
}));

describe('Authentication cookie handling', () => {
   const originalEnv = process.env;
   const CookiesMock = Cookies as unknown as jest.Mock;

   const createResponse = () => {
      const res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;
      return res;
   };

   beforeEach(() => {
      (process.env as MutableEnv) = { ...originalEnv };
      (process.env as MutableEnv).USER = 'admin';
      (process.env as MutableEnv).PASSWORD = 'password';
      (process.env as MutableEnv).SECRET = 'shhh';
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      setCookieMock.mockClear();
      CookiesMock.mockClear();
   });

   afterEach(() => {
      jest.useRealTimers();
      process.env = originalEnv;
   });

   it('sets the cookie maxAge and expires based on the configured session duration', async () => {
      (process.env as MutableEnv).SESSION_DURATION = '12';
      const baseTime = new Date('2024-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(baseTime);

      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
         body: { username: 'admin', password: 'password' },
      } as Partial<NextApiRequest>;

      const res = createResponse();

      await loginHandler(req as NextApiRequest, res);

      expect(setCookieMock).toHaveBeenCalledTimes(1);
      const [, , options] = setCookieMock.mock.calls[0];
      expect(options).toMatchObject({
         httpOnly: true,
         sameSite: 'lax',
         maxAge: 12 * 60 * 60 * 1000,
      });
      expect(options.expires).toEqual(new Date(baseTime.getTime() + (12 * 60 * 60 * 1000)));
      expect(options.secure).toBe(false);

      const [cookiesReq, cookiesRes, cookiesOptions] = CookiesMock.mock.calls[0];
      expect(cookiesReq).toBe(req);
      expect(cookiesRes).toBe(res);
      expect(cookiesOptions).toEqual({ secure: false });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
   });

   it('defaults to a 24 hour session when SESSION_DURATION is missing or invalid', async () => {
      (process.env as MutableEnv).SESSION_DURATION = 'not-a-number';
      const baseTime = new Date('2024-01-01T00:00:00.000Z');
      jest.useFakeTimers().setSystemTime(baseTime);

      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
         body: { username: 'admin', password: 'password' },
      } as Partial<NextApiRequest>;

      const res = createResponse();

      await loginHandler(req as NextApiRequest, res);

      expect(setCookieMock).toHaveBeenCalledTimes(1);
      const [, , options] = setCookieMock.mock.calls[0];
      expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
      expect(options.expires).toEqual(new Date(baseTime.getTime() + (24 * 60 * 60 * 1000)));
   });

   it('clears the authentication cookie on logout', async () => {
      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
      } as Partial<NextApiRequest>;

      const res = createResponse();

      await logoutHandler(req as NextApiRequest, res);

      expect(verifyUser).toHaveBeenCalledWith(req, res);
      expect(setCookieMock).toHaveBeenCalledWith('token', '', expect.objectContaining({
         httpOnly: true,
         sameSite: 'lax',
         maxAge: 0,
         path: '/',
         expires: new Date(0),
         secure: false,
      }));
      const [cookiesReq, cookiesRes, cookiesOptions] = CookiesMock.mock.calls[0];
      expect(cookiesReq).toBe(req);
      expect(cookiesRes).toBe(res);
      expect(cookiesOptions).toEqual({ secure: false });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, error: null });
   });

   it('sets secure cookies when requests are served over HTTPS', async () => {
      (process.env as MutableEnv).SESSION_DURATION = '1';

      const loginReq = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'secure-test-agent',
            'x-forwarded-proto': 'https',
         },
         body: { username: 'admin', password: 'password' },
      } as Partial<NextApiRequest>;

      const loginRes = createResponse();

      await loginHandler(loginReq as NextApiRequest, loginRes);

      const [, , loginOptions] = setCookieMock.mock.calls[0];
      expect(loginOptions.secure).toBe(true);

      const loginCookieConstructorCall = CookiesMock.mock.calls.find(([reqArg]) => reqArg === loginReq);
      expect(loginCookieConstructorCall?.[2]).toEqual({ secure: true });

      const logoutReq = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'secure-test-agent',
            'x-forwarded-proto': 'https',
         },
      } as Partial<NextApiRequest>;

      const logoutRes = createResponse();

      await logoutHandler(logoutReq as NextApiRequest, logoutRes);

      const logoutOptions = setCookieMock.mock.calls.find((call) => call[0] === 'token' && call[1] === '');
      expect(logoutOptions?.[2].secure).toBe(true);
      const logoutCookieConstructorCall = CookiesMock.mock.calls.find(([reqArg]) => reqArg === logoutReq);
      expect(logoutCookieConstructorCall?.[2]).toEqual({ secure: true });
   });

   it('returns 405 Method Not Allowed for non-POST requests', async () => {
      const req = {
         method: 'GET',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
      } as Partial<NextApiRequest>;

      const res = createResponse();

      await loginHandler(req as NextApiRequest, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid Method' });
   });
});
