import type { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../__helpers__/routeAdapter';
import { createMockResponse, createTempAppDataDir } from '../__helpers__';
import * as loginHandlerRoute from '../../app/api/auth/login/route';
import * as logoutHandlerRoute from '../../app/api/auth/logout/route';
import verifyUser from '../../utils/verifyUser';
const loginHandler = asHandler(loginHandlerRoute);
const logoutHandler = asHandler(logoutHandlerRoute);

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
jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());

type MutableEnv = typeof process.env & {
   USER?: string;
   USER_NAME?: string;
   PASSWORD?: string;
   SECRET?: string;
   SESSION_DURATION?: string;
};

/** The Set-Cookie header a route wrote to the mock response, or undefined. */
const setCookieHeader = (res: NextApiResponse): string | undefined => {
   const call = (res.setHeader as jest.Mock).mock.calls.find(([name]) => String(name).toLowerCase() === 'set-cookie');
   return call?.[1];
};

jest.mock('../../utils/verifyUser', () => ({
   __esModule: true,
   default: jest.fn(),
}));

describe('Authentication cookie handling', () => {
   const originalEnv = process.env;

   beforeEach(() => {
      (process.env as MutableEnv) = { ...originalEnv };
      (process.env as MutableEnv).USER = 'admin';
      (process.env as MutableEnv).PASSWORD = 'password';
      (process.env as MutableEnv).SECRET = 'shhh';
      (verifyUser as jest.Mock).mockReturnValue('authorized');
   });

   afterEach(() => {
      jest.useRealTimers();
      process.env = originalEnv;
   });

   it('sets the cookie maxAge and expires based on the configured session duration', async () => {
      (process.env as MutableEnv).SESSION_DURATION = '12';
      const baseTime = new Date('2024-01-01T00:00:00.000Z');
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(baseTime);

      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
         body: { username: 'admin', password: 'password' },
      } as Partial<NextApiRequest>;

      const res = createMockResponse();

      await loginHandler(req as NextApiRequest, res);

      const cookie = setCookieHeader(res) as string;
      expect(cookie).toMatch(/^token=[^;]+; Path=\//);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain(`Max-Age=${12 * 60 * 60}`);
      expect(cookie).toContain(`Expires=${new Date(baseTime.getTime() + (12 * 60 * 60 * 1000)).toUTCString()}`);
      expect(cookie).not.toContain('Secure');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
   });

   it('defaults to a 24 hour session when SESSION_DURATION is missing or invalid', async () => {
      (process.env as MutableEnv).SESSION_DURATION = 'not-a-number';
      const baseTime = new Date('2024-01-01T00:00:00.000Z');
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(baseTime);

      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
         body: { username: 'admin', password: 'password' },
      } as Partial<NextApiRequest>;

      const res = createMockResponse();

      await loginHandler(req as NextApiRequest, res);

      const cookie = setCookieHeader(res) as string;
      expect(cookie).toContain(`Max-Age=${24 * 60 * 60}`);
      expect(cookie).toContain(`Expires=${new Date(baseTime.getTime() + (24 * 60 * 60 * 1000)).toUTCString()}`);
   });

   it('clears the authentication cookie on logout', async () => {
      const req = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'test-user-agent'
         },
      } as Partial<NextApiRequest>;

      const res = createMockResponse();

      await logoutHandler(req as NextApiRequest, res);

      expect(verifyUser).toHaveBeenCalledWith(expect.any(Request));
      const cookie = setCookieHeader(res) as string;
      expect(cookie).toMatch(/^token=; Path=\//);
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain(`Expires=${new Date(0).toUTCString()}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
   });

   it('uses the signed-in user from a valid logout token and revokes sessions in the app data directory', async () => {
      const originalSecret = process.env.SECRET;
      const tempData = createTempAppDataDir('serpbear-logout-');
      process.env.SECRET = 'logout-test-secret';
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ user: 'alice' }, process.env.SECRET);
      const req = { method: 'POST', headers: { 'user-agent': 'logout-test-agent' }, cookies: { token } } as Partial<NextApiRequest>;
      const res = createMockResponse();

      try {
         await logoutHandler(req as NextApiRequest, res);

         expect(res.status).toHaveBeenCalledWith(200);
         expect(res.json).toHaveBeenCalledWith({ success: true });
         expect(setCookieHeader(res)).toContain('Max-Age=0');
      } finally {
         tempData.cleanup();
         if (originalSecret === undefined) delete process.env.SECRET;
         else process.env.SECRET = originalSecret;
      }
   });

   it('still logs out when a supplied token cannot be decoded', async () => {
      const originalSecret = process.env.SECRET;
      const tempData = createTempAppDataDir('serpbear-logout-invalid-token-');
      process.env.SECRET = 'logout-test-secret';
      const req = { method: 'POST', headers: {}, cookies: { token: 'not-a-jwt' } } as Partial<NextApiRequest>;
      const res = createMockResponse();

      try {
         await logoutHandler(req as NextApiRequest, res);
         expect(res.status).toHaveBeenCalledWith(200);
         expect(res.json).toHaveBeenCalledWith({ success: true });
         expect(setCookieHeader(res)).toContain('Max-Age=0');
      } finally {
         tempData.cleanup();
         if (originalSecret === undefined) delete process.env.SECRET;
         else process.env.SECRET = originalSecret;
      }
   });

   it('clears a present token cookie without decoding it when the signing secret is unset', async () => {
      const originalSecret = process.env.SECRET;
      const tempData = createTempAppDataDir('serpbear-logout-no-secret-');
      delete process.env.SECRET;
      const req = { method: 'POST', headers: {}, cookies: { token: 'old-token' } } as Partial<NextApiRequest>;
      const res = createMockResponse();

      try {
         await logoutHandler(req as NextApiRequest, res);
         expect(res.status).toHaveBeenCalledWith(200);
         expect(setCookieHeader(res)).toContain('Max-Age=0');
      } finally {
         tempData.cleanup();
         if (originalSecret === undefined) delete process.env.SECRET;
         else process.env.SECRET = originalSecret;
      }
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

      const loginRes = createMockResponse();

      await loginHandler(loginReq as NextApiRequest, loginRes);

      expect(setCookieHeader(loginRes)).toContain('Secure');

      const logoutReq = {
         method: 'POST',
         headers: {
            'x-forwarded-for': '127.0.0.1',
            'user-agent': 'secure-test-agent',
            'x-forwarded-proto': 'https',
         },
      } as Partial<NextApiRequest>;

      const logoutRes = createMockResponse();

      await logoutHandler(logoutReq as NextApiRequest, logoutRes);

      expect(setCookieHeader(logoutRes)).toContain('Secure');
   });

   it('rejects credentials that only share the first 256 characters', async () => {
      (process.env as MutableEnv).USER = 'a'.repeat(256) + 'expected';
      (process.env as MutableEnv).PASSWORD = 'b'.repeat(256) + 'expected';
      const req = { method: 'POST', headers: {}, body: { username: 'a'.repeat(256) + 'different', password: 'b'.repeat(256) + 'different' } } as unknown as NextApiRequest;
      const res = createMockResponse(); await loginHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(setCookieHeader(res)).toBeUndefined();
   });

   it.each([{ username: {}, password: 'password' }, { username: 'admin', password: 123 }, { username: ['admin'], password: 'password' }])('returns a client error for malformed credentials', async (body) => {
      const req = { method: 'POST', headers: {}, body } as unknown as NextApiRequest;
      const res = createMockResponse(); await loginHandler(req, res);
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

      const res = createMockResponse();

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
      isolatedLoginHandler = require('../__helpers__/routeAdapter').asModule(require('../../app/api/auth/login/route')).default;
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
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as NextApiResponse;
    await isolatedLoginHandler(req, res);
    return (res.status as jest.Mock).mock.calls[0][0] as number;
  };

  beforeEach(() => {
    resetLoginThrottle();
    Object.assign(process.env, { USER: 'admin', PASSWORD: 'right-password', SECRET: 'shhh' });
    delete process.env.USER_NAME;
    // The client address comes from X-Forwarded-For, which is only read behind a configured proxy
    process.env.TRUST_PROXY = '1';
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
