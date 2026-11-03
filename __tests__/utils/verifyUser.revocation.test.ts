export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import Cookies from 'cookies';
import verifyUser from '../../utils/verifyUser';
import { getSessionVersion } from '../../utils/sessionStore';

jest.mock('jsonwebtoken');
jest.mock('cookies');
jest.mock('../../utils/sessionStore', () => ({
   getSessionVersion: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
   logger: { authEvent: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const jwtVerifyMock = jwt.verify as unknown as jest.Mock;
const versionMock = getSessionVersion as unknown as jest.Mock;

describe('verifyUser session revocation', () => {
  const originalSecret = process.env.SECRET;
  const req = { method: 'GET', url: '/api/keywords?domain=example.com', headers: {} } as unknown as NextApiRequest;
  const res = {} as NextApiResponse;

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
