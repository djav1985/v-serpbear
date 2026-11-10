 
import { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/google/searchconsole/route';
import * as insightHandlerRoute from '../../app/api/google/insight/route';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../utils/searchConsole';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { readFile, writeFile } from 'fs/promises';
import { type KeywordIdeasDatabase, getLocalKeywordIdeas, updateLocalKeywordIdeas } from '../../utils/adwords';
import { getCountryInsight, getKeywordsInsight, getPagesInsight, sortInsightItems } from '../../utils/insight';
const handler = asHandler(handlerRoute);
const insightHandler = asHandler(insightHandlerRoute);

jest.mock('../../utils/searchConsole');
jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../utils/verifyUser');
jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

describe('Search Console, Volume and AdWords routes', () => {
 

  describe('searchconsole', () => {
    /**
     * Test for search console API endpoint - specifically testing the cron functionality
     * that fetches search console data for all domains.
     */


    // Mock the dependencies
    const mockFetchDomainSCData = fetchDomainSCData as jest.MockedFunction<typeof fetchDomainSCData>;
    const mockGetSearchConsoleApiInfo = getSearchConsoleApiInfo as jest.MockedFunction<typeof getSearchConsoleApiInfo>;
    const mockReadLocalSCData = readLocalSCData as jest.MockedFunction<typeof readLocalSCData>;
    const mockDomainFindAll = Domain.findAll as jest.MockedFunction<typeof Domain.findAll>;
    const mockDomainFindOne = Domain.findOne as jest.MockedFunction<typeof Domain.findOne>;


    // Common mock data structures
    const mockSCDataResponse = {
      threeDays: [],
      sevenDays: [],
      thirtyDays: [],
      lastFetched: new Date().toISOString(),
      lastFetchError: '',
      stats: [],
    };

    type MockedResponse = Partial<NextApiResponse> & {
      status: jest.Mock;
      json: jest.Mock;
    };

    describe('/api/google/searchconsole - CRON functionality', () => {
      let req: Partial<NextApiRequest>;
      let res: MockedResponse;

      beforeEach(() => {
        req = {
          method: 'POST',
          headers: {
            authorization: 'Bearer test-api-key',
          },
        };
        res = {} as unknown as MockedResponse;
        res.status = jest.fn().mockImplementation(() => res);
        res.json = jest.fn();
        (verifyUser as jest.Mock).mockReturnValue('authorized');
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it('should fetch search console data for all domains with proper API credentials', async () => {
        // Mock domain data
        const mockDomains = [
          {
            get: () => ({
              domain: 'example.com',
              search_console: JSON.stringify({
                client_email: 'test@example.com',
                private_key: 'mock-private-key',
              }),
            }),
          },
          {
            get: () => ({
              domain: 'test.com',
              search_console: JSON.stringify({
                client_email: 'test2@example.com',
                private_key: 'mock-private-key-2',
              }),
            }),
          },
        ];

        mockDomainFindAll.mockResolvedValue(mockDomains as any);

        // Mock API credentials for both domains
        mockGetSearchConsoleApiInfo
          .mockResolvedValueOnce({
            client_email: 'test@example.com',
            private_key: 'mock-private-key',
          })
          .mockResolvedValueOnce({ client_email: '', private_key: '' })
          .mockResolvedValueOnce({
            client_email: 'test2@example.com',
            private_key: 'mock-private-key-2',
          })
          .mockResolvedValueOnce({ client_email: '', private_key: '' });

        // Mock successful data fetching
        mockFetchDomainSCData.mockResolvedValue(mockSCDataResponse);

        await handler(req as NextApiRequest, res as NextApiResponse);

        // Verify that fetchDomainSCData was called for each domain with proper API credentials
        expect(mockFetchDomainSCData).toHaveBeenCalledTimes(2);
        expect(mockFetchDomainSCData).toHaveBeenNthCalledWith(
          1,
          {
            domain: 'example.com',
            search_console: JSON.stringify({
              client_email: 'test@example.com',
              private_key: 'mock-private-key',
            }),
          },
          {
            client_email: 'test@example.com',
            private_key: 'mock-private-key',
          },
          {
            client_email: '',
            private_key: '',
          },
        );
        expect(mockFetchDomainSCData).toHaveBeenNthCalledWith(
          2,
          {
            domain: 'test.com',
            search_console: JSON.stringify({
              client_email: 'test2@example.com',
              private_key: 'mock-private-key-2',
            }),
          },
          {
            client_email: 'test2@example.com',
            private_key: 'mock-private-key-2',
          },
          {
            client_email: '',
            private_key: '',
          },
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'completed' });
      });

      it('should skip domains without search console API credentials', async () => {
        // Mock domain without search console credentials
        const mockDomains = [
          {
            get: () => ({
              domain: 'no-console.com',
              search_console: null,
            }),
          },
        ];

        mockDomainFindAll.mockResolvedValue(mockDomains as any);

        // Mock no API credentials found
        mockGetSearchConsoleApiInfo
          .mockResolvedValueOnce({ client_email: '', private_key: '' })
          .mockResolvedValueOnce({ client_email: '', private_key: '' });

        await handler(req as NextApiRequest, res as NextApiResponse);

        // Verify that fetchDomainSCData was not called for domains without credentials
        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'completed' });
      });

      it('should handle errors gracefully and continue processing other domains', async () => {
        const mockDomains = [
          {
            get: () => ({
              domain: 'error-domain.com',
              search_console: JSON.stringify({
                client_email: 'error@example.com',
                private_key: 'error-key',
              }),
            }),
          },
          {
            get: () => ({
              domain: 'success-domain.com',
              search_console: JSON.stringify({
                client_email: 'success@example.com',
                private_key: 'success-key',
              }),
            }),
          },
        ];

        mockDomainFindAll.mockResolvedValue(mockDomains as any);

        mockGetSearchConsoleApiInfo
          .mockResolvedValueOnce({
            client_email: 'error@example.com',
            private_key: 'error-key',
          })
          .mockResolvedValueOnce({ client_email: '', private_key: '' })
          .mockResolvedValueOnce({
            client_email: 'success@example.com',
            private_key: 'success-key',
          })
          .mockResolvedValueOnce({ client_email: '', private_key: '' });

        // Mock error for first domain, success for second
        mockFetchDomainSCData
          .mockRejectedValueOnce(new Error('API Error'))
          .mockResolvedValueOnce(mockSCDataResponse);

        await handler(req as NextApiRequest, res as NextApiResponse);

        // Verify both domains were processed despite the error
        expect(mockFetchDomainSCData).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'completed' });
      });
    });

    describe('/api/google/searchconsole - CRON failure reporting', () => {
      it('answers 502 when every domain fails to update', async () => {
        mockDomainFindAll.mockResolvedValue([
          { get: () => ({ domain: 'a.com', search_console: JSON.stringify({ client_email: 'a@x.com', private_key: 'k' }) }) },
        ] as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'a@x.com', private_key: 'k' });
        mockFetchDomainSCData.mockRejectedValue(new Error('Google down'));
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const req = { method: 'POST', headers: {}, query: {} };
        (verifyUser as jest.Mock).mockReturnValue('authorized');

        await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(502);
      });
    });

    describe('GET /api/google/searchconsole', () => {
      let req: Partial<NextApiRequest>;
      let res: Partial<NextApiResponse>;

      beforeEach(() => {
        req = {
          method: 'GET',
          query: { domain: 'my-site.com' },
          headers: {
            authorization: 'Bearer test-api-key',
          },
        };
        res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        jest.clearAllMocks();
        (verifyUser as jest.Mock).mockReturnValue('authorized');
        mockReadLocalSCData.mockResolvedValue(false);
      });

      it('looks the domain up by its real name, including hyphens, and returns 404 when it is unknown', async () => {
        mockDomainFindOne.mockResolvedValue(null as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockDomainFindOne).toHaveBeenCalledWith({ where: { domain: 'my-site.com' } });
        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Domain not found.' }) }),
        );
      });

      it('returns 400 for a domain that is not a real domain name', async () => {
        req.query = { domain: '../../etc/passwd' };

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockDomainFindOne).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });

    describe('GET /api/google/insight', () => {
      let req: Partial<NextApiRequest>;
      let res: Partial<NextApiResponse>;

      beforeEach(() => {
        req = {
          method: 'GET',
          query: { domain: 'my-site.com' },
          headers: {
            authorization: 'Bearer token',
          },
        };
        res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        (verifyUser as jest.Mock).mockReturnValue('authorized');
        mockReadLocalSCData.mockResolvedValue(false);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'client', private_key: 'key' });
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it('looks the domain up by its real name, including hyphens, and returns 404 when it does not exist', async () => {
        mockDomainFindOne.mockResolvedValue(null as any);

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockDomainFindOne).toHaveBeenCalledWith({ where: { domain: 'my-site.com' } });
        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Domain not found.' }) }),
        );
      });

      it('returns 400 for a domain that is not a real domain name', async () => {
        req.query = { domain: 'bad/domain' };

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockDomainFindOne).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'Domain is Missing.' }) }),
        );
      });
    });
  });

  describe('volume', () => {
    let handler: any;
    let db: any;
    let Keyword: any;
    let verifyUser: any;
    let parseKeywords: any;
    let getKeywordsVolume: any;
    let updateKeywordsVolumeData: any;
    jest.isolateModules(() => {
      jest.doMock('../../database/database', () => ({
         __esModule: true,
         default: { sync: jest.fn() },
      }));
      jest.doMock('../../database/models/keyword', () => ({
         __esModule: true,
         default: {
            findAll: jest.fn(),
         },
      }));
      jest.doMock('../../utils/verifyUser', () => ({
         __esModule: true,
         default: jest.fn(),
      }));
      jest.doMock('../../utils/parseKeywords', () => ({
         __esModule: true,
         default: jest.fn(),
      }));
      jest.doMock('../../utils/adwords', () => ({
         __esModule: true,
         getKeywordsVolume: jest.fn(),
         updateKeywordsVolumeData: jest.fn(),
      }));
      jest.doMock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
      const m0 = require('../__helpers__/routeAdapter').asModule(require('../../app/api/google/volume/route'));
      handler = m0 && m0.__esModule ? m0.default : m0;
      const m1 = require('../../database/database');
      db = m1 && m1.__esModule ? m1.default : m1;
      const m2 = require('../../database/models/keyword');
      Keyword = m2 && m2.__esModule ? m2.default : m2;
      const m3 = require('../../utils/verifyUser');
      verifyUser = m3 && m3.__esModule ? m3.default : m3;
      const m4 = require('../../utils/parseKeywords');
      parseKeywords = m4 && m4.__esModule ? m4.default : m4;
      const m5 = require('../../utils/adwords');
      getKeywordsVolume = m5.getKeywordsVolume;
      updateKeywordsVolumeData = m5.updateKeywordsVolumeData;
    });

    const dbMock = db as unknown as { sync: jest.Mock };
    const keywordModelMock = Keyword as unknown as { findAll: jest.Mock };
    const verifyUserMock = verifyUser as unknown as jest.Mock;
    const parseKeywordsMock = parseKeywords as unknown as jest.Mock;
    const getKeywordsVolumeMock = getKeywordsVolume as unknown as jest.Mock;
    const updateKeywordsVolumeDataMock = updateKeywordsVolumeData as unknown as jest.Mock;

    describe('POST /api/google/volume', () => {
       beforeEach(() => {
          dbMock.sync.mockResolvedValue(undefined);
          verifyUserMock.mockReturnValue('authorized');
          parseKeywordsMock.mockReturnValue([{ ID: 1, keyword: 'alpha', volume: 0 }]);
          keywordModelMock.findAll.mockResolvedValue([
             { get: () => ({ ID: 1, keyword: 'alpha', volume: 0 }) },
          ]);
          getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 25 } });
          updateKeywordsVolumeDataMock.mockResolvedValue({ 1: 25 });
       });

       afterEach(() => {
          jest.clearAllMocks();
       });

       const createResponse = () => {
          const res = {
             status: jest.fn().mockReturnThis(),
             json: jest.fn(),
          } as unknown as NextApiResponse;
          return res;
       };

       it('returns computed volumes when update flag is false', async () => {
          const req = {
             method: 'POST',
             body: { keywords: [1], update: false },
             headers: {},
          } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          // db.sync() is now called at startup via instrumentation, not in handlers
          expect(verifyUserMock).toHaveBeenCalledWith(expect.any(Request));
          expect(keywordModelMock.findAll).toHaveBeenCalled();
          expect(getKeywordsVolumeMock).toHaveBeenCalledWith([{ ID: 1, keyword: 'alpha', volume: 0 }]);
          expect(updateKeywordsVolumeDataMock).not.toHaveBeenCalled();
          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith({
             keywords: [{ ID: 1, keyword: 'alpha', volume: 25 }],
             volumes: { 1: 25 },
          });
       });

       it('updates keyword volumes and returns refreshed data', async () => {
          parseKeywordsMock.mockReturnValueOnce([{ ID: 1, keyword: 'alpha', volume: 0 }])
             .mockReturnValueOnce([{ ID: 1, keyword: 'alpha', volume: 25 }]);
          const req = {
             method: 'POST',
             body: { keywords: [1], update: true },
             headers: {},
          } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          expect(updateKeywordsVolumeDataMock).toHaveBeenCalledWith({ 1: 25 }, [{ ID: 1, keyword: 'alpha', volume: 0 }]);
          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith({
             keywords: [{ ID: 1, keyword: 'alpha', volume: 25 }],
             volumes: { 1: 25 },
          });
       });

       it('keeps keyword query when both keywords and domain are provided', async () => {
          parseKeywordsMock.mockReturnValue([
             { ID: 1, keyword: 'alpha', volume: 0 },
             { ID: 2, keyword: 'beta', volume: 0 },
          ]);
          keywordModelMock.findAll.mockResolvedValue([
             { get: () => ({ ID: 1, keyword: 'alpha', volume: 0 }) },
             { get: () => ({ ID: 2, keyword: 'beta', volume: 0 }) },
          ]);
          getKeywordsVolumeMock.mockResolvedValue({ volumes: { 1: 25, 2: 50 } });

          const req = {
             method: 'POST',
             body: { keywords: [1], domain: 'example.com', update: false },
             headers: {},
          } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          expect(keywordModelMock.findAll).toHaveBeenCalledTimes(1);
          expect(getKeywordsVolumeMock).toHaveBeenCalledWith([
             { ID: 1, keyword: 'alpha', volume: 0 },
             { ID: 2, keyword: 'beta', volume: 0 },
          ]);
          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith({
             keywords: [
                { ID: 1, keyword: 'alpha', volume: 25 },
                { ID: 2, keyword: 'beta', volume: 50 },
             ],
             volumes: { 1: 25, 2: 50 },
          });
       });

       it('returns 400 when a keyword ID is not a positive integer, without querying', async () => {
          const req = { method: 'POST', body: { keywords: [1, 'abc'] }, headers: {} } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(keywordModelMock.findAll).not.toHaveBeenCalled();
       });

       it('returns 400 when domain is not a string', async () => {
          const req = { method: 'POST', body: { keywords: [], domain: { $ne: '' } }, headers: {} } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(keywordModelMock.findAll).not.toHaveBeenCalled();
       });

       it('limits how often domain=all can start paid lookups', async () => {
          const { resetRateLimits } = jest.requireActual('../../utils/rateLimit');
          resetRateLimits();
          const run = async () => {
             const req = { method: 'POST', body: { domain: 'all', update: false }, headers: {}, socket: { remoteAddress: '192.0.2.5' } } as unknown as NextApiRequest;
             const res = createResponse();
             await handler(req, res);
             return res;
          };

          expect((await run()).status).toHaveBeenCalledWith(200);
          expect((await run()).status).toHaveBeenCalledWith(200);
          const limited = await run();
          expect(limited.status).toHaveBeenCalledWith(429);
          expect(getKeywordsVolumeMock).toHaveBeenCalledTimes(2);
          resetRateLimits();
       });

       it('answers 500 when saving the volumes fails', async () => {
          updateKeywordsVolumeDataMock.mockRejectedValue(new Error('db failure'));
          const req = { method: 'POST', body: { keywords: [1] }, headers: {} } as unknown as NextApiRequest;
          const res = createResponse();

          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(500);
       });
    });
  });

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
      jest.doMock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
      jest.doMock('fs/promises', () => ({ readFile: jest.fn() }));
      jest.doMock('../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
      jest.doMock('../../utils/settingsFile', () => ({ ...jest.requireActual('../../utils/settingsFile'), withSettingsLock: (section: () => Promise<unknown>) => section() }));
      jest.doMock('cryptr', () => ({ __esModule: true, default: jest.fn(() => ({ decrypt: decryptMock, encrypt: encryptMock })) }));
      jest.doMock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ getToken: getTokenMock })) }));
      jest.doMock('../../utils/adwords', () => ({ getAdwordsCredentials: jest.fn(), getAdwordsKeywordIdeas: jest.fn() }));
      jest.doMock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
      const m0 = require('google-auth-library');
      OAuth2Client = m0.OAuth2Client;
      const m1 = require('fs/promises');
      readFile = m1.readFile;
      const m2 = require('../__helpers__/routeAdapter').asModule(require('../../app/api/adwords/route'));
      handler = m2 && m2.__esModule ? m2.default : m2;
      const m3 = require('../../utils/verifyUser');
      verifyUser = m3 && m3.__esModule ? m3.default : m3;
      const m4 = require('../../utils/atomicWrite');
      atomicWriteFile = m4.atomicWriteFile;
      const m5 = require('../../utils/adwords');
      getAdwordsCredentials = m5.getAdwordsCredentials;
      getAdwordsKeywordIdeas = m5.getAdwordsKeywordIdeas;
      const m6 = require('../__helpers__');
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

  describe('adwords ideasPath', () => {
    const readMock = readFile as unknown as jest.Mock;
    const writeMock = writeFile as unknown as jest.Mock;

    describe('ideas file access only accepts real domain names', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it.each(['../../settings', 'example/../../x', 'my_site-com.com', 'a b', '%2e%2e', ''])('refuses to read for %p without touching the file system', async (domain) => {
        await expect(getLocalKeywordIdeas(domain)).resolves.toBe(false);
        expect(readMock).not.toHaveBeenCalled();
      });

      it('refuses to write for a path-like domain', async () => {
        await expect(updateLocalKeywordIdeas('../../settings', { favorites: [] })).resolves.toBe(false);
        expect(writeMock).not.toHaveBeenCalled();
      });

      it('reads the ideas file of a hyphenated domain under its real name', async () => {
        readMock.mockResolvedValue(JSON.stringify({ keywords: [{ uid: 'k1' }] }));

        const result = await getLocalKeywordIdeas('my-site.com');

        expect(readMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_my-site\.com\.json$/), expect.anything());
        expect(result).toEqual({ keywords: [{ uid: 'k1' }] });
      });
    });
  });

  describe('insight', () => {
    describe('Insight Functions', () => {
      const mockSCData: SCDomainDataType = {
        threeDays: [
          {
            keyword: 'test keyword 1',
            uid: 'us:desktop:test_keyword_1',
            device: 'desktop',
            country: 'US',
            clicks: 10,
            impressions: 100,
            ctr: 10,
            position: 5,
            page: '/page1',
          },
          {
            keyword: 'test keyword 2',
            uid: 'ca:mobile:test_keyword_2',
            device: 'mobile',
            country: 'CA',
            clicks: 20,
            impressions: 200,
            ctr: 10,
            position: 3,
            page: '/page2',
          },
          {
            keyword: 'test keyword 1',
            uid: 'ca:desktop:test_keyword_1',
            device: 'desktop',
            country: 'CA',
            clicks: 5,
            impressions: 50,
            ctr: 10,
            position: 7,
            page: '/page1',
          },
        ],
        sevenDays: [],
        thirtyDays: [],
        lastFetched: new Date().toISOString(),
        lastFetchError: '',
        stats: [],
      };

      describe('getCountryInsight', () => {
        it('should return country insights with correct data', () => {
          const result = getCountryInsight(mockSCData, 'clicks', 'threeDays');

          expect(result).toHaveLength(2);

          // Check US data
          const usData = result.find((item) => item.country === 'US');
          expect(usData).toBeDefined();
          expect(usData?.clicks).toBe(10);
          expect(usData?.impressions).toBe(100);
          expect(usData?.keywords).toBe(1);

          // Check CA data
          const caData = result.find((item) => item.country === 'CA');
          expect(caData).toBeDefined();
          expect(caData?.clicks).toBe(25); // 20 + 5
          expect(caData?.impressions).toBe(250); // 200 + 50
          expect(caData?.keywords).toBe(2); // 'test keyword 2' + 'test keyword 1'
        });

        it('should handle empty data gracefully', () => {
          const emptyData: SCDomainDataType = {
            threeDays: [],
            sevenDays: [],
            thirtyDays: [],
            lastFetched: '',
            lastFetchError: '',
            stats: [],
          };

          expect(getCountryInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
          expect(getKeywordsInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
          expect(getPagesInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
        });

        it('should handle invalid data gracefully', () => {
          expect(getCountryInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
          expect(getKeywordsInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
          expect(getPagesInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
        });
      });

      describe('getKeywordsInsight', () => {
        it('should return keyword insights with correct country data', () => {
          const result = getKeywordsInsight(mockSCData, 'clicks', 'threeDays');

          expect(result).toHaveLength(2);

          // Check 'test keyword 1' - should appear in 2 countries (US, CA)
          const keyword1Data = result.find((item) => item.keyword === 'test keyword 1');
          expect(keyword1Data).toBeDefined();
          expect(keyword1Data?.clicks).toBe(15); // 10 + 5
          expect(keyword1Data?.countries).toBe(2); // US + CA

          // Check 'test keyword 2' - should appear in 1 country (CA)
          const keyword2Data = result.find((item) => item.keyword === 'test keyword 2');
          expect(keyword2Data).toBeDefined();
          expect(keyword2Data?.clicks).toBe(20);
          expect(keyword2Data?.countries).toBe(1); // CA only
        });

      });

      describe('getPagesInsight', () => {
        it('should return page insights with correct data', () => {
          const result = getPagesInsight(mockSCData, 'clicks', 'threeDays');

          expect(result).toHaveLength(2);

          // Check /page1
          const page1Data = result.find((item) => item.page === '/page1');
          expect(page1Data).toBeDefined();
          expect(page1Data?.clicks).toBe(15); // 10 + 5
          expect(page1Data?.keywords).toBe(2); // 2 occurrences of 'test keyword 1'
          expect(page1Data?.countries).toBe(2); // US + CA

          // Check /page2
          const page2Data = result.find((item) => item.page === '/page2');
          expect(page2Data).toBeDefined();
          expect(page2Data?.clicks).toBe(20);
          expect(page2Data?.keywords).toBe(1); // 1 occurrence of 'test keyword 2'
          expect(page2Data?.countries).toBe(1); // CA only
        });

      });

      describe('Data integrity and bug fixes', () => {
        it('should correctly populate countries array in keyword insights (bug fix verification)', () => {
          const result = getKeywordsInsight(mockSCData, 'clicks', 'threeDays');

          const keyword1Data = result.find((item) => item.keyword === 'test keyword 1');
          // Before the fix, this would be counting keywords instead of countries
          expect(keyword1Data?.countries).toBe(2); // Should be 2 countries: US, CA

          const keyword2Data = result.find((item) => item.keyword === 'test keyword 2');
          expect(keyword2Data?.countries).toBe(1); // Should be 1 country: CA
        });

        it('should average country metrics per row and keep underscore keywords distinct', () => {
          const data: SCDomainDataType = {
            threeDays: [
              { keyword: 'a b', uid: 'us:desktop:a_b', device: 'desktop', country: 'US', clicks: 1, impressions: 1, ctr: 10, position: 2, page: '/p' },
              { keyword: 'a b', uid: 'us:mobile:a_b', device: 'mobile', country: 'US', clicks: 1, impressions: 1, ctr: 20, position: 4, page: '/p' },
              { keyword: 'a_b', uid: 'us:desktop:a__b', device: 'desktop', country: 'US', clicks: 1, impressions: 1, ctr: 30, position: 6, page: '/p' },
            ],
            sevenDays: [],
            thirtyDays: [],
            lastFetched: '',
            lastFetchError: '',
            stats: [],
          };

          // 3 rows, 2 unique keywords: averages divide by rows (position 12/3, ctr 60/3)
          const countryResult = getCountryInsight(data, 'clicks', 'threeDays');
          expect(countryResult[0].position).toBe(4);
          expect(countryResult[0].ctr).toBe(20);
          expect(countryResult[0].keywords).toBe(2);

          const keywordResult = getKeywordsInsight(data, 'clicks', 'threeDays');
          expect(keywordResult).toHaveLength(2);
          const spaced = keywordResult.find((item) => item.keyword === 'a b');
          const underscored = keywordResult.find((item) => item.keyword === 'a_b');
          expect(spaced?.clicks).toBe(2);
          expect(spaced?.position).toBe(3);
          expect(underscored?.clicks).toBe(1);
          expect(underscored?.position).toBe(6);

          // Large Search Console windows (25,000 distinct queries and pages) are aggregated in a single pass
          const largeRows = Array.from({ length: 25000 }, (_, i) => ({
            keyword: `kw ${i}`, uid: `us:desktop:${i}`, device: 'desktop', country: i % 2 ? 'US' : 'CA', clicks: 1, impressions: 2, ctr: 5, position: 3, page: `/p${i}`,
          }));
          const large: SCDomainDataType = { ...data, threeDays: largeRows as SCDomainDataType['threeDays'] };
          const startedAt = Date.now();
          expect(getKeywordsInsight(large, 'clicks', 'threeDays')).toHaveLength(25000);
          expect(getPagesInsight(large, 'clicks', 'threeDays')).toHaveLength(25000);
          expect(getCountryInsight(large, 'clicks', 'threeDays')).toHaveLength(2);
          expect(Date.now() - startedAt).toBeLessThan(2000);
        });

        it('should handle null/undefined values in data', () => {
          const malformedData: SCDomainDataType = {
            threeDays: [
              {
                keyword: 'test keyword',
                uid: 'us:desktop:test_keyword',
                device: 'desktop',
                country: 'US',
                clicks: null as any,
                impressions: undefined as any,
                ctr: 10,
                position: 5,
                page: '/page1',
              },
            ],
            sevenDays: [],
            thirtyDays: [],
            lastFetched: '',
            lastFetchError: '',
            stats: [],
          };

          const keywordResult = getKeywordsInsight(malformedData, 'clicks', 'threeDays');
          expect(keywordResult).toHaveLength(1);
          expect(keywordResult[0].clicks).toBe(0); // Should default to 0
          expect(keywordResult[0].impressions).toBe(0); // Should default to 0

          const countryResult = getCountryInsight(malformedData, 'clicks', 'threeDays');
          expect(countryResult).toHaveLength(1);
          expect(countryResult[0].clicks).toBe(0); // Should default to 0
          expect(countryResult[0].impressions).toBe(0); // Should default to 0

          const pageResult = getPagesInsight(malformedData, 'clicks', 'threeDays');
          expect(pageResult).toHaveLength(1);
          expect(pageResult[0].clicks).toBe(0); // Should default to 0
          expect(pageResult[0].impressions).toBe(0); // Should default to 0
        });
      });

      describe('sortInsightItems', () => {
        it('sorts position values in ascending order placing undefined at the end', () => {
          const items: SCInsightItem[] = [
            { clicks: 0, impressions: 0, ctr: 0, position: 5 },
            { clicks: 0, impressions: 0, ctr: 0, position: 1 },
            { clicks: 0, impressions: 0, ctr: 0, position: undefined as unknown as number },
          ];

          const sorted = sortInsightItems([...items], 'position');

          expect(sorted[0].position).toBe(1);
          expect(sorted[1].position).toBe(5);
          expect(sorted[2].position).toBeUndefined();
        });
      });
    });
  });
});

describe('ideas route', () => {
  let readFile: any;
  let writeFile: any;
  let db: any;
  let handler: any;
  let verifyUser: any;
  let getAdwordsCredentials: any;
  let getAdwordsKeywordIdeas: any;
  let createMockRequest: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
    jest.doMock('../../utils/adwords', () => ({
      __esModule: true,
      ...jest.requireActual('../../utils/adwords'),
      getAdwordsCredentials: jest.fn(),
      getAdwordsKeywordIdeas: jest.fn(),
      // The file lock needs a real file on disk; the test only checks the read-modify-write itself
      withIdeasLock: (_domain: string, fn: () => Promise<unknown>) => fn(),
    }));
    jest.doMock('../../utils/atomicWrite', () => ({
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- forwards the temp path the route computed in tests
      atomicWriteFile: (filePath: string, data: string, encoding: string) => require('fs/promises').writeFile(filePath, data, encoding),
    }));
    jest.doMock('fs/promises', () => ({
      __esModule: true,
      readFile: jest.fn(),
      writeFile: jest.fn(),
    }));
    jest.doMock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
    jest.doMock('../../utils/logger', () => ({
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        isSuccessLoggingEnabled: jest.fn(() => true),
      },
    }));
    const m0 = require('fs/promises');
    readFile = m0.readFile;
    writeFile = m0.writeFile;
    const m1 = require('../../database/database');
    db = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../__helpers__/routeAdapter').asModule(require('../../app/api/google/ideas/route'));
    handler = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../utils/verifyUser');
    verifyUser = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../../utils/adwords');
    getAdwordsCredentials = m4.getAdwordsCredentials;
    getAdwordsKeywordIdeas = m4.getAdwordsKeywordIdeas;
    const m5 = require('../__helpers__');
    createMockRequest = m5.createMockRequest;
    createMockResponse = m5.createMockResponse;
  });

  // The local keyword store (getLocalKeywordIdeas / updateLocalKeywordIdeas) runs for real so the
  // favorites test can assert what is persisted; only the Google Ads calls are stubbed.
  // Writes go through atomicWriteFile; route them to the mocked writeFile so the assertions still see the contents
  const valid = { keywords: ['shoes'], country: 'US', language: '1000', domain: 'example.com', seedType: 'custom' };

  const post = async (body: Record<string, unknown>) => {
    const req = createMockRequest({ method: 'POST', body });
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return res;
  };

  describe('POST /api/google/ideas input validation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (getAdwordsCredentials as jest.Mock).mockResolvedValue({ client_id: 'a', client_secret: 'b', developer_token: 'c', account_id: 'd', refresh_token: 'e' });
      (getAdwordsKeywordIdeas as jest.Mock).mockResolvedValue([{ uid: 'us:shoes', keyword: 'shoes' }]);
    });

    it.each([
      ['a domain that could leave the data folder', { domain: '../../../etc/passwd' }],
      ['a domain that is not a string', { domain: ['a'] }],
      ['a domain without a dot', { domain: 'localhost' }],
      ['an auto seed without a domain', { seedType: 'auto', domain: undefined }],
      ['a country that is not a two-letter code', { country: 'USA' }],
      ['a language that is not a numeric ID', { language: 'english' }],
      ['keywords that are not strings', { keywords: [{ a: 1 }] }],
    ])('returns 400 for %s, before calling Google Ads', async (_label, override) => {
      const res = await post({ ...valid, ...override });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(getAdwordsKeywordIdeas).not.toHaveBeenCalled();
    });

    it('accepts a valid request', async () => {
      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledTimes(1);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ domain: 'example.com' }));
    });

    it('upper-cases a lower-case country code before calling Google Ads', async () => {
      const res = await post({ ...valid, country: 'gb' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ country: 'GB' }));
    });

    it('answers 400 instead of 500 for a null body', async () => {
      const req = createMockRequest({ method: 'POST', body: null });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('does not return the raw Google Ads error text to the client', async () => {
      (getAdwordsKeywordIdeas as jest.Mock).mockRejectedValue(new Error('Google Ads API error (403): developer token secret-detail'));
      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain('secret-detail');
    });

    it('treats a request without a domain as research and passes no domain to Google Ads', async () => {
      const res = await post({ ...valid, domain: undefined });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ domain: '' }));
    });
  });

  describe('PUT /api/google/ideas favorites persistence', () => {
     beforeEach(() => {
        jest.clearAllMocks();
        (db.sync as jest.Mock).mockResolvedValue(undefined);
        (verifyUser as jest.Mock).mockReturnValue('authorized');
        (writeFile as jest.Mock).mockResolvedValue(undefined);
     });

     it('persists an empty favorites array after toggling off a keyword', async () => {
        const keyword = { uid: 'kw-1', keyword: 'test keyword' } as any;
        const storedDatabase = {
           keywords: [keyword],
           favorites: [keyword],
           settings: { seedType: 'custom' },
           updated: Date.now(),
        } as KeywordIdeasDatabase;

        (readFile as jest.Mock).mockResolvedValue(JSON.stringify(storedDatabase));

        const req = {
           method: 'PUT',
           body: { keywordID: 'kw-1', domain: 'example.com' },
           headers: {},
           connection: {},
        } as unknown as NextApiRequest;

        const res = {
           status: jest.fn().mockReturnThis(),
           json: jest.fn(),
        } as unknown as NextApiResponse;

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ keywords: [], error: '' });
        expect(writeFile).toHaveBeenCalledTimes(1);

        const [, contents] = (writeFile as jest.Mock).mock.calls[0];
        const saved = JSON.parse(contents as string) as KeywordIdeasDatabase;
        expect(saved.favorites).toEqual([]);
     });
  });
});
