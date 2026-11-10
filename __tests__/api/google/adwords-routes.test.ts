import { NextApiResponse } from 'next';
jest.mock('../../../utils/searchConsole');
jest.mock('../../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../../utils/verifyUser');
jest.mock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('../../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

describe('adwords', () => {
    let OAuth2Client: any;
    let readFile: any;
    let handler: any;
    let verifyUser: any;
    let atomicWriteFile: any;
    let getAdwordsCredentials: any;
    let getAdwordsKeywordIdeas: any;
    let createMockRequest: any;
    let createMockResponse: any;
    jest.isolateModules(() => {
      jest.doMock('../../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
      jest.doMock('fs/promises', () => ({ readFile: jest.fn() }));
      jest.doMock('../../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
      jest.doMock('../../../utils/settingsFile', () => ({ ...jest.requireActual('../../../utils/settingsFile'), withSettingsLock: (section: () => Promise<unknown>) => section() }));
      jest.doMock('cryptr', () => ({ __esModule: true, default: jest.fn(() => ({ decrypt: decryptMock, encrypt: encryptMock })) }));
      jest.doMock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ getToken: getTokenMock })) }));
      jest.doMock('../../../utils/adwords', () => ({ getAdwordsCredentials: jest.fn(), getAdwordsKeywordIdeas: jest.fn() }));
      jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
      const m0 = require('google-auth-library');
      OAuth2Client = m0.OAuth2Client;
      const m1 = require('fs/promises');
      readFile = m1.readFile;
      const m2 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/adwords/route'));
      handler = m2 && m2.__esModule ? m2.default : m2;
      const m3 = require('../../../utils/verifyUser');
      verifyUser = m3 && m3.__esModule ? m3.default : m3;
      const m4 = require('../../../utils/atomicWrite');
      atomicWriteFile = m4.atomicWriteFile;
      const m5 = require('../../../utils/adwords');
      getAdwordsCredentials = m5.getAdwordsCredentials;
      getAdwordsKeywordIdeas = m5.getAdwordsKeywordIdeas;
      const m6 = require('../../__helpers__');
      createMockRequest = m6.createMockRequest;
      createMockResponse = m6.createMockResponse;
    });

    // The settings lock is tested on its own (utils/settingsFile.lock.test.ts); here the section just runs
    const decryptMock = jest.fn((value: string) => value.replace('encrypted-', ''));
    const encryptMock = jest.fn((value: string) => `encrypted-${value}`);
    const getTokenMock = jest.fn();
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

      it.each([['missing', undefined], ['unknown', 'never-issued']])('rejects %s state without token exchange or persistence', async (_label, state) => {
        await startFlow();
        const res = response(); await handler(callback(state), res);
        expect(res.status).toHaveBeenCalledWith(400);
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
  });
