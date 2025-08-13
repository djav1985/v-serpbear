import type { NextApiRequest, NextApiResponse } from 'next';
import verifyUser from '../../utils/verifyUser';
import Cookies from 'cookies';
import jwt from 'jsonwebtoken';

jest.mock('cookies');
jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

describe('verifyUser', () => {
  const res = {} as NextApiResponse;

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SECRET;
    delete process.env.APIKEY;
  });

  it('authorizes valid token', () => {
    (Cookies as unknown as jest.Mock).mockImplementation(() => ({ get: () => 'tok' }));
    (jwt.verify as jest.Mock).mockImplementation(() => true);
    process.env.SECRET = 's';
    const reqTok = { headers: {} } as any;
    const result = verifyUser(reqTok, res);
    expect(result).toBe('authorized');
  });

  it('authorizes valid API key for allowed route', () => {
    (Cookies as unknown as jest.Mock).mockImplementation(() => ({ get: () => undefined }));
    process.env.APIKEY = 'key';
    const apiReq = { headers: { authorization: 'Bearer key' }, method: 'GET', url: '/api/keywords' } as any;
    const result = verifyUser(apiReq, res);
    expect(result).toBe('authorized');
  });

  it('rejects invalid API key', () => {
    (Cookies as unknown as jest.Mock).mockImplementation(() => ({ get: () => undefined }));
    process.env.APIKEY = 'key';
    const apiReq = { headers: { authorization: 'Bearer wrong' }, method: 'GET', url: '/api/keywords' } as any;
    const result = verifyUser(apiReq, res);
    expect(result).toBe('Invalid API Key Provided.');
  });
});
