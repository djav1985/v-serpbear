import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser, { checkApiKey } from '../utils/verifyUser';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { getApiKeyAttemptKeys } from '../utils/apiKeyThrottle';
import { clearLoginFailures, isLoginLocked, recordLoginFailure, resetLoginThrottle } from '../utils/loginThrottle';
import { resetRateLimits, takeRateLimitToken } from '../utils/rateLimit';
import { readFileSync, writeFileSync } from 'fs';
import { atomicWriteFile } from '../utils/atomicWrite';

import { getSessionVersion } from '../utils/sessionStore';

jest.mock('jsonwebtoken');
jest.mock('cookies');
jest.mock('../utils/sessionStore', () => ({
   getSessionVersion: jest.fn(() => 0),
}));
jest.mock('../utils/logger', () => ({
   logger: {
      authEvent: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
   },
}));
jest.mock('fs', () => ({
  __esModule: true,
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));
jest.mock('fs/promises', () => ({
  __esModule: true,
  mkdir: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/atomicWrite', () => ({
  __esModule: true,
  atomicWriteFile: jest.fn().mockResolvedValue(undefined),
}));

describe('verifyUser', () => {
  describe('verifyUser', () => {
     let req: Partial<NextApiRequest>;
     let res: Partial<NextApiResponse>;
     const originalEnv = process.env;

     beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
      
        req = {
           method: 'GET',
           url: '/api/serp/domains',
           headers: {},
           cookies: {},
        };
      
        res = {
           setHeader: jest.fn(),
           getHeader: jest.fn(),
        };
     });

     afterEach(() => {
        process.env = originalEnv;
     });

     describe('Bearer token validation', () => {
        it('should reject authorization header without Bearer prefix', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'test-api-key' };
           req.url = '/api/serp/domains';
           req.method = 'GET';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('Invalid API Key Provided.');
        });

        it('should accept valid Bearer token with correct API key', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer test-api-key' };
           req.url = '/api/serp/domains';
           req.method = 'GET';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('authorized');
        });

        it('should reject Bearer token with incorrect API key', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer wrong-key' };
           req.url = '/api/serp/domains';
           req.method = 'GET';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('Invalid API Key Provided.');
        });

        it('should lock a client address after 5 wrong keys, and clear the count on a right key', () => {
           process.env.APIKEY = 'test-api-key';
           req.socket = { remoteAddress: '203.0.113.9' } as NextApiRequest['socket'];
           const attempt = (key: string) => {
              req.headers = { authorization: `Bearer ${key}` };
              verifyUser(req as NextApiRequest, res as NextApiResponse);
           };
           const keys = getApiKeyAttemptKeys(req as NextApiRequest);
           resetLoginThrottle();

           for (let i = 0; i < 4; i += 1) { attempt('wrong'); }
           expect(isLoginLocked(keys)).toBe(false);
           attempt('test-api-key');
           for (let i = 0; i < 4; i += 1) { attempt('wrong'); }
           expect(isLoginLocked(keys)).toBe(false);
           attempt('wrong');
           expect(isLoginLocked(keys)).toBe(true);
           resetLoginThrottle();
        });

        it('does not count non-Bearer Authorization headers as API key attempts', () => {
           process.env.APIKEY = 'test-api-key';
           req.socket = { remoteAddress: '203.0.113.20' } as NextApiRequest['socket'];
           const keys = getApiKeyAttemptKeys(req as NextApiRequest);
           resetLoginThrottle();

           for (let i = 0; i < 10; i += 1) {
              req.headers = { authorization: 'Basic dXNlcjpwYXNz' };
              verifyUser(req as NextApiRequest, res as NextApiResponse);
           }

           expect(isLoginLocked(keys)).toBe(false);
        });

        it('does not count a wrong Bearer key sent together with a valid session cookie', () => {
           process.env.APIKEY = 'test-api-key';
           process.env.SECRET = 'test-secret';
           req.socket = { remoteAddress: '203.0.113.21' } as NextApiRequest['socket'];
           (Cookies as jest.MockedClass<typeof Cookies>).mockImplementation(() => ({ get: jest.fn().mockReturnValue('valid-jwt-token') } as any));
           (jwt.verify as jest.Mock).mockReturnValue({ user: 'testuser' });
           const keys = getApiKeyAttemptKeys(req as NextApiRequest);
           resetLoginThrottle();

           for (let i = 0; i < 10; i += 1) {
              req.headers = { authorization: 'Bearer wrong' };
              expect(verifyUser(req as NextApiRequest, res as NextApiResponse)).toBe('authorized');
           }

           expect(isLoginLocked(keys)).toBe(false);
        });

        it('should reject Bearer token without space', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearertest-api-key' };
           req.url = '/api/serp/domains';
           req.method = 'GET';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('Invalid API Key Provided.');
        });
     });

     describe('JWT token validation', () => {
        it('should authorize valid JWT token synchronously', () => {
           process.env.SECRET = 'test-secret';
         
           // Mock Cookies to return a valid JWT token
           const mockGet = jest.fn().mockReturnValue('valid-jwt-token');
           (Cookies as jest.MockedClass<typeof Cookies>).mockImplementation(() => ({
              get: mockGet,
           } as any));
         
           (jwt.verify as jest.Mock).mockReturnValue({ user: 'testuser' });

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(jwt.verify).toHaveBeenCalledWith('valid-jwt-token', 'test-secret');
           expect(result).toBe('authorized');
        });

        it('should reject invalid JWT token synchronously', () => {
           process.env.SECRET = 'test-secret';
         
           // Mock Cookies to return an invalid JWT token
           const mockGet = jest.fn().mockReturnValue('invalid-jwt-token');
           (Cookies as jest.MockedClass<typeof Cookies>).mockImplementation(() => ({
              get: mockGet,
           } as any));
         
           (jwt.verify as jest.Mock).mockImplementation(() => {
              throw new Error('Invalid token');
           });

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('Not authorized');
        });
     });

     describe('API route restrictions', () => {
        it('should allow API key access to allowed routes', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer test-api-key' };
           req.url = '/api/app/cron';
           req.method = 'POST';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('authorized');
        });


        it('should allow API key access to ideas GET route', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer test-api-key' };
           req.url = '/api/google/ideas';
           req.method = 'GET';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('authorized');
        });

        it('should allow API key access to ideas POST route', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer test-api-key' };
           req.url = '/api/google/ideas';
           req.method = 'POST';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('authorized');
        });

        it('should reject API key access to non-allowed routes', () => {
           process.env.APIKEY = 'test-api-key';
           req.headers = { authorization: 'Bearer test-api-key' };
           req.url = '/api/app/settings';
           req.method = 'PUT';

           const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

           expect(result).toBe('This Route cannot be accessed with API.');
        });
     });
  });

  describe('verifyUser session revocation', () => {
    const originalSecret = process.env.SECRET;
    const req = { method: 'GET', url: '/api/serp/keywords?domain=example.com', headers: {} } as unknown as NextApiRequest;
    const res = {} as NextApiResponse;
    const versionMock = getSessionVersion as unknown as jest.Mock;
    const jwtVerifyMock = jwt.verify as unknown as jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret';
      (Cookies as unknown as jest.Mock).mockImplementation(() => ({ get: () => 'session-token' }));
    });

    afterEach(() => {
      if (originalSecret === undefined) {
        delete process.env.SECRET;
      } else {
        process.env.SECRET = originalSecret;
      }
    });

    it('accepts a token whose version matches the current session version', () => {
      versionMock.mockReturnValue(2);
      jwtVerifyMock.mockReturnValue({ user: 'admin', sv: 2 });

      expect(verifyUser(req, res)).toBe('authorized');
    });

    it('rejects a token issued before the last logout', () => {
      versionMock.mockReturnValue(2);
      jwtVerifyMock.mockReturnValue({ user: 'admin', sv: 1 });

      expect(verifyUser(req, res)).toBe('Not authorized');
    });

    it('treats a token without a version as version 0', () => {
      versionMock.mockReturnValue(0);
      jwtVerifyMock.mockReturnValue({ user: 'admin' });
      expect(verifyUser(req, res)).toBe('authorized');

      versionMock.mockReturnValue(1);
      expect(verifyUser(req, res)).toBe('Not authorized');
    });
  });

  describe('checkApiKey', () => {
     const makeReq = (authorization?: string) => ({
        method: 'POST',
        url: '/api/mcp',
        headers: authorization ? { authorization } : {},
        socket: { remoteAddress: '203.0.113.9' },
     } as unknown as NextApiRequest);

     beforeEach(() => {
        process.env.APIKEY = 'right-key';
        resetLoginThrottle();
     });

     it('accepts only the exact Bearer key', () => {
        expect(checkApiKey(makeReq('Bearer right-key'))).toBe(true);
        expect(checkApiKey(makeReq('Bearer wrong-key'))).toBe(false);
        expect(checkApiKey(makeReq('Basic right-key'))).toBe(false);
        expect(checkApiKey(makeReq())).toBe(false);
     });

     it('counts wrong Bearer keys, but not other schemes or a missing header, and a right key clears them', () => {
        const req = makeReq('Bearer wrong-key');
        for (let i = 0; i < 4; i += 1) { checkApiKey(req); }
        checkApiKey(makeReq('Basic whatever'));
        checkApiKey(makeReq());
        expect(isLoginLocked(getApiKeyAttemptKeys(req))).toBe(false);
        checkApiKey(req);
        expect(isLoginLocked(getApiKeyAttemptKeys(req))).toBe(true);

        resetLoginThrottle();
        checkApiKey(req);
        checkApiKey(makeReq('Bearer right-key'));
        for (let i = 0; i < 4; i += 1) { checkApiKey(req); }
        expect(isLoginLocked(getApiKeyAttemptKeys(req))).toBe(false);
     });

     it('does not count a wrong key when shouldCountFailure says no', () => {
        const req = makeReq('Bearer wrong-key');
        for (let i = 0; i < 6; i += 1) { checkApiKey(req, () => false); }
        expect(isLoginLocked(getApiKeyAttemptKeys(req))).toBe(false);
     });
  });
});

describe('login throttle', () => {
  describe('login throttle', () => {
    const userKey = [{ key: 'user:admin', maxFailures: 5 }];
    const start = 1_000_000;

    beforeEach(() => {
      resetLoginThrottle();
    });

    it('is not locked before the failure limit is reached', () => {
      for (let i = 0; i < 4; i += 1) {
        recordLoginFailure(userKey, start);
      }

      expect(isLoginLocked(userKey, start)).toBe(false);
    });

    it('locks the key once it reaches the limit, and unlocks after 15 minutes', () => {
      for (let i = 0; i < 5; i += 1) {
        recordLoginFailure(userKey, start);
      }

      expect(isLoginLocked(userKey, start + 1000)).toBe(true);
      expect(isLoginLocked(userKey, start + 15 * 60 * 1000 + 1)).toBe(false);
    });

    it('starts a new window when the old one has expired', () => {
      for (let i = 0; i < 4; i += 1) {
        recordLoginFailure(userKey, start);
      }
      recordLoginFailure(userKey, start + 16 * 60 * 1000);

      expect(isLoginLocked(userKey, start + 16 * 60 * 1000)).toBe(false);
    });

    it('clears failures for its keys after a successful login', () => {
      for (let i = 0; i < 5; i += 1) {
        recordLoginFailure(userKey, start);
      }

      clearLoginFailures(userKey);

      expect(isLoginLocked(userKey, start)).toBe(false);
    });

    it('counts keys separately, so one locked key does not lock another', () => {
      const attackerKeys = [{ key: 'user:admin', maxFailures: 5 }, { key: 'ip:10.0.0.9', maxFailures: 20 }];
      for (let i = 0; i < 5; i += 1) {
        recordLoginFailure([{ key: 'ip:10.0.0.9', maxFailures: 20 }], start);
      }
      recordLoginFailure(attackerKeys, start);

      expect(isLoginLocked([{ key: 'ip:10.0.0.10', maxFailures: 20 }], start)).toBe(false);
    });

    it('locks a client address after its higher limit is reached', () => {
      const ipKey = [{ key: 'ip:10.0.0.9', maxFailures: 20 }];
      for (let i = 0; i < 20; i += 1) {
        recordLoginFailure(ipKey, start);
      }

      expect(isLoginLocked(ipKey, start)).toBe(true);
    });
  });

  describe('loginThrottle bounds', () => {
    beforeEach(() => resetLoginThrottle());

    it('does not grow without limit when many distinct keys fail', () => {
      for (let i = 0; i < 6000; i += 1) {
        recordLoginFailure([{ key: `user:flood-${i}`, maxFailures: 5 }], 1000);
      }
      // the newest keys are still tracked, the oldest were evicted
      for (let i = 0; i < 5; i += 1) {
        recordLoginFailure([{ key: 'user:flood-5999', maxFailures: 5 }], 1000);
      }
      expect(isLoginLocked([{ key: 'user:flood-5999', maxFailures: 5 }], 1001)).toBe(true);
      expect(isLoginLocked([{ key: 'user:flood-0', maxFailures: 5 }], 1001)).toBe(false);
    });
  });

  describe('login throttle eviction', () => {
    beforeEach(() => {
      resetLoginThrottle();
    });

    it('keeps an active lock when the tracked set is full', () => {
      const victim = [{ key: 'user:victim', maxFailures: 2 }];
      recordLoginFailure(victim, 1000);
      recordLoginFailure(victim, 1000);
      expect(isLoginLocked(victim, 1001)).toBe(true);
      for (let i = 0; i < 6000; i += 1) {
        recordLoginFailure([{ key: `user:flood-${i}`, maxFailures: 5 }], 1000);
      }
      expect(isLoginLocked(victim, 1001)).toBe(true);
    });
  });

  describe('takeRateLimitToken', () => {
    const start = 1_000_000;

    beforeEach(() => {
      resetRateLimits();
    });

    it('allows up to the limit within one window, then refuses', () => {
      const results = Array.from({ length: 4 }, () => takeRateLimitToken('k', 3, 60_000, start));

      expect(results).toEqual([true, true, true, false]);
    });

    it('allows again once the window has passed', () => {
      for (let i = 0; i < 3; i += 1) takeRateLimitToken('k', 3, 60_000, start);

      expect(takeRateLimitToken('k', 3, 60_000, start + 59_999)).toBe(false);
      expect(takeRateLimitToken('k', 3, 60_000, start + 60_000)).toBe(true);
    });

    it('keeps keys apart', () => {
      for (let i = 0; i < 3; i += 1) takeRateLimitToken('a', 3, 60_000, start);

      expect(takeRateLimitToken('b', 3, 60_000, start)).toBe(true);
    });
  });
});

describe('session store', () => {
  // verifyUser's tests above replace utils/sessionStore with a mock; these tests need the real one.
  const { getSessionVersion, resetSessionVersionCache, revokeAllSessions } = jest.requireActual('../utils/sessionStore') as typeof import('../utils/sessionStore');
  const readMock = readFileSync as unknown as jest.Mock;
  const writeSyncMock = writeFileSync as unknown as jest.Mock;
  const writeMock = atomicWriteFile as unknown as jest.Mock;

  describe('sessionStore', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      resetSessionVersionCache();
    });

    it('keeps the last known version when the file becomes unreadable', () => {
      readMock.mockReturnValueOnce('{"version":3}');
      expect(getSessionVersion()).toBe(3);

      readMock.mockImplementation(() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); });
      expect(getSessionVersion()).toBe(3);

      readMock.mockReturnValue('not json');
      expect(getSessionVersion()).toBe(3);
    });

    it('uses the version written by logout even if the file cannot be read afterwards', async () => {
      readMock.mockReturnValueOnce('{"version":1}');
      await revokeAllSessions();

      readMock.mockImplementation(() => { throw new Error('gone'); });
      expect(getSessionVersion()).toBe(2);
    });

    it('reads the stored version', () => {
      readMock.mockReturnValue('{"version":3}');

      expect(getSessionVersion()).toBe(3);
    });

    it('generates and stores a non-zero version when the file is missing', () => {
      readMock.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });

      const version = getSessionVersion();

      expect(version).toBeGreaterThan(0);
      expect(writeSyncMock).toHaveBeenCalledWith(expect.stringMatching(/session\.json$/), JSON.stringify({ version }), 'utf-8');
      // Stays stable while the file is still missing
      expect(getSessionVersion()).toBe(version);
    });

    it('generates a non-zero version for a corrupt or negative value', () => {
      readMock.mockReturnValue('not json');
      expect(getSessionVersion()).toBeGreaterThan(0);

      resetSessionVersionCache();
      readMock.mockReturnValue('{"version":-2}');
      expect(getSessionVersion()).toBeGreaterThan(0);
    });

    it('does not overwrite the file on a transient read error', () => {
      readMock.mockImplementation(() => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); });

      expect(getSessionVersion()).toBeGreaterThan(0);
      expect(writeSyncMock).not.toHaveBeenCalled();
    });

    it('moves the version forward and stores it on logout', async () => {
      readMock.mockReturnValue('{"version":3}');

      await expect(revokeAllSessions()).resolves.toBe(4);

      expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/session\.json$/), '{"version":4}', 'utf-8');
    });

    it('moves past a freshly generated version on logout', async () => {
      readMock.mockImplementation(() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
      const first = getSessionVersion();

      await expect(revokeAllSessions()).resolves.toBe(first + 1);
    });
  });
});
