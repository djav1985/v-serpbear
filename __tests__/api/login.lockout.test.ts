export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import loginHandler from '../../pages/api/login';
import { resetLoginThrottle } from '../../utils/loginThrottle';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), verbose: jest.fn(), isSuccessLoggingEnabled: jest.fn(() => true) },
}));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));
jest.mock('../../utils/sessionStore', () => ({ getSessionVersion: jest.fn(() => 0) }));
jest.mock('cookies', () => ({ __esModule: true, default: jest.fn(() => ({ set: jest.fn() })) }));

const attempt = async (ip: string, username: string, password: string) => {
  const req = {
    method: 'POST',
    body: { username, password },
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as NextApiRequest;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
  await loginHandler(req, res);
  return (res.status as jest.Mock).mock.calls[0][0] as number;
};

describe('login lockout', () => {
  const original = { ...process.env };

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
});
