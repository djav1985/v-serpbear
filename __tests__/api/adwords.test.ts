import type { NextApiResponse } from 'next';
import { OAuth2Client } from 'google-auth-library';
import { readFile } from 'fs/promises';
import handler from '../../pages/api/adwords';
import verifyUser from '../../utils/verifyUser';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
jest.mock('../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
// The settings lock is tested on its own (utils/settingsFile.lock.test.ts); here the section just runs
jest.mock('../../utils/settingsFile', () => ({ ...jest.requireActual('../../utils/settingsFile'), withSettingsLock: (section: () => Promise<unknown>) => section() }));
const decryptMock = jest.fn((value: string) => value.replace('encrypted-', ''));
const encryptMock = jest.fn((value: string) => `encrypted-${value}`);
jest.mock('cryptr', () => ({ __esModule: true, default: jest.fn(() => ({ decrypt: decryptMock, encrypt: encryptMock })) }));
const getTokenMock = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ getToken: getTokenMock })) }));
jest.mock('../../utils/adwords', () => ({ getAdwordsCredentials: jest.fn(), getAdwordsKeywordIdeas: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: unknown) => fn }));

const getAdwordsCredentialsMock = getAdwordsCredentials as jest.Mock;
const getAdwordsKeywordIdeasMock = getAdwordsKeywordIdeas as jest.Mock;
type MutableEnv = typeof process.env & { SECRET?: string; NEXT_PUBLIC_APP_URL?: string; APP_URL?: string };
const response = () => ({ ...createMockResponse(), send: jest.fn(), setHeader: jest.fn().mockReturnThis() } as unknown as NextApiResponse);
const callback = (state?: string) => createMockRequest({ method: 'GET', query: { code: 'auth-code', ...(state ? { state } : {}) }, headers: { host: 'attacker.example' } });

/** Starts the OAuth flow the way the Connect button does and returns the state Google will echo back. */
const startFlow = async (): Promise<string> => {
  const res = response();
  await handler(createMockRequest({ method: 'GET', headers: { host: 'attacker.example' } }), res);
  expect(res.status).toHaveBeenCalledWith(200);
  const payload = (res.json as jest.Mock).mock.calls[0][0];
  return new URL(payload.authUrl).searchParams.get('state') as string;
};

describe('Google Ads OAuth state flow', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    (process.env as MutableEnv) = { ...originalEnv, SECRET: 'secret', NEXT_PUBLIC_APP_URL: 'https://trusted.example' };
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (readFile as jest.Mock).mockResolvedValue('{"adwords_client_id":"encrypted-client-id","adwords_client_secret":"encrypted-client-secret"}');
    getTokenMock.mockResolvedValue({ tokens: { refresh_token: 'refresh-token' } });
    (atomicWriteFile as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('requires authorization to start integration', async () => {
    (verifyUser as jest.Mock).mockReturnValue('not authorized');
    const res = response(); await handler(createMockRequest({ method: 'GET' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects unsupported methods', async () => {
    const res = response(); await handler(createMockRequest({ method: 'PATCH' }), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('starts integration with a random state and the trusted callback origin', async () => {
    const res = response(); await handler(createMockRequest({ method: 'GET', headers: { host: 'attacker.example', 'x-forwarded-host': 'evil.example' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    const url = new URL(payload.authUrl);
    expect(url.searchParams.get('redirect_uri')).toBe('https://trusted.example/api/adwords');
    expect(url.searchParams.get('state')).toHaveLength(43);
  });

  it('does not set a state cookie (the state is kept on the server)', async () => {
    const res = response(); await handler(createMockRequest({ method: 'GET', headers: { host: 'attacker.example' } }), res);
    expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
  });

  it('rejects oauth flow startup when no trusted app origin is configured', async () => {
    delete (process.env as MutableEnv).NEXT_PUBLIC_APP_URL;
    delete (process.env as MutableEnv).APP_URL;
    const res = response(); await handler(createMockRequest({ method: 'GET', headers: { host: 'attacker.example' } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rejects a missing or unknown state without token exchange or persistence', async () => {
    for (const state of [undefined, 'never-issued']) {
      await startFlow();
      const res = response(); await handler(callback(state), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(atomicWriteFile).not.toHaveBeenCalled();
  });

  it('accepts a valid state once and rejects replay', async () => {
    const state = await startFlow();
    const first = response(); await handler(callback(state), first);
    expect(getTokenMock).toHaveBeenCalledWith('auth-code');
    expect(first.status).toHaveBeenCalledWith(200);
    const replay = response(); await handler(callback(state), replay);
    expect(replay.status).toHaveBeenCalledWith(400);
    expect(getTokenMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a state that has expired', async () => {
    const state = await startFlow();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
    const res = response(); await handler(callback(state), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it('does not persist when token exchange fails', async () => {
    const state = await startFlow();
    getTokenMock.mockRejectedValueOnce(new Error('exchange failed'));
    const res = response(); await handler(callback(state), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(atomicWriteFile).not.toHaveBeenCalled();
  });

  it('persists the refresh token only after successful exchange', async () => {
    const state = await startFlow();
    const res = response(); await handler(callback(state), res);
    expect(OAuth2Client).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: 'https://trusted.example/api/adwords' }));
    expect(atomicWriteFile).toHaveBeenCalledWith(expect.stringContaining('data/settings.json'), expect.stringContaining('encrypted-refresh-token'), 'utf-8');
  });

  it('drops removed settings keys when it writes the refresh token', async () => {
    (readFile as jest.Mock).mockResolvedValue('{"adwords_client_id":"encrypted-client-id","search_console":{"client_email":"x"},"notification_email":"a@example.com"}');
    const state = await startFlow();
    const res = response(); await handler(callback(state), res);
    const written = (atomicWriteFile as jest.Mock).mock.calls[0][1] as string;
    expect(written).toContain('encrypted-refresh-token');
    expect(written).not.toContain('search_console');
    expect(written).not.toContain('notification_email');
  });
});

describe('POST /api/adwords validation flow', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    (process.env as MutableEnv) = { ...originalEnv, SECRET: 'secret', NEXT_PUBLIC_APP_URL: 'https://trusted.example' };
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (readFile as jest.Mock).mockResolvedValue('{}');
    getAdwordsCredentialsMock.mockResolvedValue({
      client_id: 'cid',
      client_secret: 'csecret',
      refresh_token: 'rtoken',
    });
    getAdwordsKeywordIdeasMock.mockResolvedValue([{ text: 'compress' }]);
    (atomicWriteFile as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => { process.env = originalEnv; });

  it('returns 400 when developer token or account id is missing', async () => {
    const res = response();
    await handler(createMockRequest({ method: 'POST', body: { developer_token: 'dev' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getAdwordsKeywordIdeasMock).not.toHaveBeenCalled();
  });

  it('returns 400 when oauth credentials are missing', async () => {
    getAdwordsCredentialsMock.mockResolvedValueOnce({ client_id: '', client_secret: '', refresh_token: '' });
    const res = response();
    await handler(createMockRequest({ method: 'POST', body: { developer_token: 'dev', account_id: 'acc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(atomicWriteFile).not.toHaveBeenCalled();
  });

  it('returns 400 when keyword ideas exchange fails', async () => {
    getAdwordsKeywordIdeasMock.mockRejectedValueOnce(new Error('bad creds'));
    const res = response();
    await handler(createMockRequest({ method: 'POST', body: { developer_token: 'dev', account_id: 'acc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(atomicWriteFile).not.toHaveBeenCalled();
  });

  it('returns 200 and persists encrypted values when validation succeeds', async () => {
    const res = response();
    await handler(createMockRequest({ method: 'POST', body: { developer_token: ' dev ', account_id: ' acc ' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ valid: true });
    expect(atomicWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('data/settings.json'),
      expect.stringContaining('"adwords_developer_token":"encrypted-dev"'),
      'utf-8',
    );
    expect(atomicWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('data/settings.json'),
      expect.stringContaining('"adwords_account_id":"encrypted-acc"'),
      'utf-8',
    );
  });
});
