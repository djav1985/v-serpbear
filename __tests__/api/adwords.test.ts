import type { NextApiRequest, NextApiResponse } from 'next';
import { OAuth2Client } from 'google-auth-library';
import { readFile } from 'fs/promises';
import handler from '../../pages/api/adwords';
import verifyUser from '../../utils/verifyUser';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { createMockRequest, createMockResponse } from '../__helpers__';

const cookieStore = new Map<string, string>();
const cookieSet = jest.fn((name: string, value: string) => value ? cookieStore.set(name, value) : cookieStore.delete(name));
jest.mock('cookies', () => ({ __esModule: true, default: jest.fn(() => ({ get: (name: string) => cookieStore.get(name), set: cookieSet })) }));
jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
const decryptMock = jest.fn((value: string) => value.replace('encrypted-', ''));
const encryptMock = jest.fn((value: string) => `encrypted-${value}`);
jest.mock('cryptr', () => ({ __esModule: true, default: jest.fn(() => ({ decrypt: decryptMock, encrypt: encryptMock })) }));
const getTokenMock = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ getToken: getTokenMock })) }));
jest.mock('../../utils/adwords', () => ({ getAdwordsCredentials: jest.fn(), getAdwordsKeywordIdeas: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: unknown) => fn }));

type MutableEnv = typeof process.env & { SECRET?: string; NEXT_PUBLIC_APP_URL?: string };
const response = () => ({ ...createMockResponse(), send: jest.fn(), setHeader: jest.fn().mockReturnThis() } as unknown as NextApiResponse);
const callback = (state?: string) => createMockRequest({ method: 'GET', query: { code: 'auth-code', ...(state ? { state } : {}) }, headers: { host: 'attacker.example' } });

describe('Google Ads OAuth state flow', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.clearAllMocks(); cookieStore.clear();
    (process.env as MutableEnv) = { ...originalEnv, SECRET: 'secret', NEXT_PUBLIC_APP_URL: 'https://trusted.example' };
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (readFile as jest.Mock).mockResolvedValue('{"adwords_client_id":"encrypted-client-id","adwords_client_secret":"encrypted-client-secret"}');
    getTokenMock.mockResolvedValue({ tokens: { refresh_token: 'refresh-token' } });
    (atomicWriteFile as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => { process.env = originalEnv; });

  it('requires authorization to start integration', async () => {
    (verifyUser as jest.Mock).mockReturnValue('not authorized');
    const res = response(); await handler(createMockRequest({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects unsupported methods', async () => {
    const res = response(); await handler(createMockRequest({ method: 'PATCH' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('starts integration with a random state cookie and trusted callback origin', async () => {
    const res = response(); await handler(createMockRequest({ method: 'GET', headers: { host: 'attacker.example', 'x-forwarded-host': 'evil.example' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    const url = new URL(payload.authUrl);
    expect(url.searchParams.get('redirect_uri')).toBe('https://trusted.example/api/adwords');
    expect(url.searchParams.get('state')).toHaveLength(43);
    expect(cookieSet).toHaveBeenCalledWith('adwords_oauth_state', url.searchParams.get('state'), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }));
  });

  it.each([['missing', undefined], ['mismatched', 'wrong']])('rejects %s state without token exchange or persistence', async (_label, state) => {
    cookieStore.set('adwords_oauth_state', 'expected');
    const res = response(); await handler(callback(state), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(atomicWriteFile).not.toHaveBeenCalled();
    expect(cookieStore.has('adwords_oauth_state')).toBe(false);
  });

  it('accepts valid state once and rejects replay', async () => {
    cookieStore.set('adwords_oauth_state', 'expected');
    const first = response(); await handler(callback('expected'), first);
    expect(getTokenMock).toHaveBeenCalledWith('auth-code');
    expect(first.status).toHaveBeenCalledWith(200);
    const replay = response(); await handler(callback('expected'), replay);
    expect(replay.status).toHaveBeenCalledWith(400);
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  it('does not persist when token exchange fails', async () => {
    cookieStore.set('adwords_oauth_state', 'expected'); getTokenMock.mockRejectedValueOnce(new Error('exchange failed'));
    const res = response(); await handler(callback('expected'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(atomicWriteFile).not.toHaveBeenCalled();
  });

  it('persists the refresh token only after successful exchange', async () => {
    cookieStore.set('adwords_oauth_state', 'expected');
    const res = response(); await handler(callback('expected'), res);
    expect(OAuth2Client).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: 'https://trusted.example/api/adwords' }));
    expect(atomicWriteFile).toHaveBeenCalledWith(expect.stringContaining('data/settings.json'), expect.stringContaining('encrypted-refresh-token'), 'utf-8');
  });
});
