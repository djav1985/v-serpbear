import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser, { checkApiKey } from '../../utils/verifyUser';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import { getSessionVersion } from '../../utils/sessionStore';
import { getApiKeyAttemptKeys } from '../../utils/apiKeyThrottle';
import { isLoginLocked, resetLoginThrottle } from '../../utils/loginThrottle';

jest.mock('jsonwebtoken');
jest.mock('cookies');
jest.mock('../../utils/sessionStore', () => ({
   getSessionVersion: jest.fn(() => 0),
}));
jest.mock('../../utils/logger', () => ({
   logger: {
      authEvent: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
   },
}));

describe('verifyUser', () => {
   let req: Partial<NextApiRequest>;
   let res: Partial<NextApiResponse>;
   const originalEnv = process.env;

   beforeEach(() => {
      jest.clearAllMocks();
      process.env = { ...originalEnv };
      
      req = {
         method: 'GET',
         url: '/api/domains',
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
         req.url = '/api/domains';
         req.method = 'GET';

         const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

         expect(result).toBe('Invalid API Key Provided.');
      });

      it('should accept valid Bearer token with correct API key', () => {
         process.env.APIKEY = 'test-api-key';
         req.headers = { authorization: 'Bearer test-api-key' };
         req.url = '/api/domains';
         req.method = 'GET';

         const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

         expect(result).toBe('authorized');
      });

      it('should reject Bearer token with incorrect API key', () => {
         process.env.APIKEY = 'test-api-key';
         req.headers = { authorization: 'Bearer wrong-key' };
         req.url = '/api/domains';
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
         req.url = '/api/domains';
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
         req.method = 'POST';

         // The cron worker calls both of these with only the API key
         for (const url of ['/api/cron', '/api/volume']) {
            req.url = url;
            const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

            expect(result).toBe('authorized');
         }
      });


      it('should allow API key access to ideas GET route', () => {
         process.env.APIKEY = 'test-api-key';
         req.headers = { authorization: 'Bearer test-api-key' };
         req.url = '/api/ideas';
         req.method = 'GET';

         const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

         expect(result).toBe('authorized');
      });

      it('should allow API key access to ideas POST route', () => {
         process.env.APIKEY = 'test-api-key';
         req.headers = { authorization: 'Bearer test-api-key' };
         req.url = '/api/ideas';
         req.method = 'POST';

         const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

         expect(result).toBe('authorized');
      });

      it('should reject API key access to non-allowed routes', () => {
         process.env.APIKEY = 'test-api-key';
         req.headers = { authorization: 'Bearer test-api-key' };
         req.url = '/api/settings';
         req.method = 'PUT';

         const result = verifyUser(req as NextApiRequest, res as NextApiResponse);

         expect(result).toBe('This Route cannot be accessed with API.');
      });
   });
});

describe('verifyUser session revocation', () => {
  const originalSecret = process.env.SECRET;
  const req = { method: 'GET', url: '/api/keywords?domain=example.com', headers: {} } as unknown as NextApiRequest;
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
