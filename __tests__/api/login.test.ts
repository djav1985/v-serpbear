import type { NextApiRequest, NextApiResponse } from 'next';
import loginHandler from '../../pages/api/auth/login';
import logoutHandler from '../../pages/api/auth/logout';
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
      expect(res.json).toHaveBeenCalledWith({ success: true });
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
      expect(res.json).toHaveBeenCalledWith({ success: true });
   });

   it('sets secure cookies when requests are served over HTTPS', async () => {
      (process.env as MutableEnv).SESSION_DURATION = '1';
      // Forwarded protocol headers are only trusted behind a configured reverse proxy
      (process.env as MutableEnv).TRUST_PROXY = '1';

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

   it('rejects credentials that only share the first 256 characters', async () => {
      (process.env as MutableEnv).USER = 'a'.repeat(256) + 'expected';
      (process.env as MutableEnv).PASSWORD = 'b'.repeat(256) + 'expected';
      const req = { method: 'POST', headers: {}, body: { username: 'a'.repeat(256) + 'different', password: 'b'.repeat(256) + 'different' } } as unknown as NextApiRequest;
      const res = createResponse(); await loginHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(setCookieMock).not.toHaveBeenCalled();
   });

   it.each([{ username: {}, password: 'password' }, { username: 'admin', password: 123 }, { username: ['admin'], password: 'password' }])('returns a client error for malformed credentials', async (body) => {
      const req = { method: 'POST', headers: {}, body } as unknown as NextApiRequest;
      const res = createResponse(); await loginHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
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
      expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }) }),
    );
   });
});

// Lockout tests need a fresh login handler and loginThrottle state, plus their own sessionStore mock.
describe('login lockout', () => {
  const original = { ...process.env };
  let isolatedLoginHandler: any;
  let resetLoginThrottle: () => void;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../../utils/sessionStore', () => ({ getSessionVersion: jest.fn(() => 0) }));
    jest.isolateModules(() => {
      isolatedLoginHandler = require('../../pages/api/auth/login').default;
      resetLoginThrottle = require('../../utils/loginThrottle').resetLoginThrottle;
    });
  });

  const attempt = async (ip: string, username: string, password: string) => {
    const req = {
      method: 'POST',
      body: { username, password },
      headers: {},
      socket: { remoteAddress: ip },
    } as unknown as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
    await isolatedLoginHandler(req, res);
    return (res.status as jest.Mock).mock.calls[0][0] as number;
  };

  beforeEach(() => {
    resetLoginThrottle();
    Object.assign(process.env, { USER: 'admin', PASSWORD: 'right-password', SECRET: 'shhh' });
    delete process.env.USER_NAME;
    delete process.env.TRUST_PROXY;
  });

  afterAll(() => {
    process.env = original;
  });

  it('locks the real user out only for the address that failed', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await attempt('1.1.1.1', 'admin', 'wrong')).toBe(401);
    }
    expect(await attempt('1.1.1.1', 'admin', 'right-password')).toBe(429);
    // an attacker's failures do not stop the owner logging in from elsewhere
    expect(await attempt('2.2.2.2', 'admin', 'right-password')).toBe(200);
  });

  it('limits one address that tries many usernames', async () => {
    for (let i = 0; i < 20; i += 1) {
      await attempt('3.3.3.3', `made-up-${i}`, 'wrong');
    }
    expect(await attempt('3.3.3.3', 'made-up-next', 'wrong')).toBe(429);
    expect(await attempt('4.4.4.4', 'made-up-next', 'wrong')).toBe(401);
  });

  it('does not let failures spread over many addresses lock out the correct password', async () => {
    for (let i = 0; i < 25; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        expect(await attempt(`10.0.0.${i}`, 'admin', 'wrong')).toBe(401);
      }
    }
    // the user-wide cap (100) is reached: wrong passwords are refused, the right one still works
    expect(await attempt('9.9.9.9', 'admin', 'wrong')).toBe(429);
    expect(await attempt('9.9.9.9', 'admin', 'right-password')).toBe(200);
  });

  it('keeps counting the failures of each address while the user-wide cap is reached', async () => {
    for (let i = 0; i < 25; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        await attempt(`10.0.0.${i}`, 'admin', 'wrong');
      }
    }
    // user-wide cap reached: a fresh address still locks after its own 5 wrong guesses
    for (let i = 0; i < 5; i += 1) {
      expect(await attempt('8.8.8.8', 'admin', 'wrong')).toBe(429);
    }
    // so even the right password is now refused from that address
    expect(await attempt('8.8.8.8', 'admin', 'right-password')).toBe(429);
    // other addresses can still log in
    expect(await attempt('7.7.7.7', 'admin', 'right-password')).toBe(200);
  });

  it('returns 400 for a missing or non-object body', async () => {
    for (const body of [null, undefined, 'text', ['admin']]) {
      const req = { method: 'POST', body, headers: {}, socket: { remoteAddress: '8.8.8.8' } } as unknown as NextApiRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await isolatedLoginHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });
});
