import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser from '../../utils/verifyUser';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';

jest.mock('jsonwebtoken');
jest.mock('cookies');
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
         req.url = '/api/cron';
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
