 
import type { NextApiRequest, NextApiResponse } from 'next';
import { buildKeywordAddPayloads, getAddKeywordsMessage, getDomainLocations, getDomainTags, getLocationUpdateMessage, planLocationUpdate, scraperAllowsCity, splitAlreadyTracked } from '../utils/keywordMeta';

describe('domains', () => {
  let Cryptr: any;
  let readFile: any;
  let unlink: any;
  let handler: any;
  let db: any;
  let Domain: any;
  let Keyword: any;
  let verifyUser: any;
  let removeLocalSCData: any;
  let retryQueueManager: any;
  let atomicWriteFile: any;
  let refreshQueue: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../database/init', () => ({
      __esModule: true,
      ensureDatabase: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../database/models/domain', () => ({
      __esModule: true,
      default: { findOne: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../database/models/keyword', () => ({
      __esModule: true,
      default: { destroy: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../utils/searchConsole', () => ({
      __esModule: true,
      checkSearchConsoleIntegration: jest.fn(() => ({ isValid: true })),
      removeLocalSCData: jest.fn(),
    }));
    jest.doMock('../utils/retryQueueManager', () => ({ retryQueueManager: { removeBatch: jest.fn() } }));
    jest.doMock('../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
    jest.doMock('fs/promises', () => ({ readFile: jest.fn(), mkdir: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('../utils/fileLock', () => ({ withFileLock: (_path: string, section: () => Promise<unknown>) => section() }));
    jest.doMock('../utils/refreshQueue', () => ({
      refreshQueue: {
        enqueue: jest.fn(async (_taskId: string, task: () => Promise<void>) => { await task(); }),
        isDomainLocked: jest.fn(() => false),
      },
    }));
    jest.doMock('../utils/apiLogging', () => ({
      __esModule: true,
      withApiLogging: (apiHandler: any) => apiHandler,
    }));
    const m0 = require('cryptr');
    Cryptr = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('fs/promises');
    readFile = m1.readFile;
    unlink = m1.unlink;
    const m2 = require('../pages/api/serp/domains');
    handler = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../database/database');
    db = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../database/models/domain');
    Domain = m4 && m4.__esModule ? m4.default : m4;
    const m5 = require('../database/models/keyword');
    Keyword = m5 && m5.__esModule ? m5.default : m5;
    const m6 = require('../utils/verifyUser');
    verifyUser = m6 && m6.__esModule ? m6.default : m6;
    const m7 = require('../utils/searchConsole');
    removeLocalSCData = m7.removeLocalSCData;
    const m8 = require('../utils/retryQueueManager');
    retryQueueManager = m8.retryQueueManager;
    const m9 = require('../utils/atomicWrite');
    atomicWriteFile = m9.atomicWriteFile;
    const m10 = require('../utils/refreshQueue');
    refreshQueue = m10.refreshQueue;
    const m11 = require('./__helpers__');
    createMockResponse = m11.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const dbMock = db as unknown as { sync: jest.Mock; transaction: jest.Mock };
  const DomainMock = Domain as unknown as { findOne: jest.Mock; destroy: jest.Mock; bulkCreate: jest.Mock; findAll: jest.Mock };
  const KeywordMock = Keyword as unknown as { destroy: jest.Mock; findAll: jest.Mock };
  const removeLocalSCDataMock = removeLocalSCData as unknown as jest.Mock;
  const removeBatchMock = retryQueueManager.removeBatch as jest.Mock;
  const readFileMock = readFile as unknown as jest.Mock;
  const unlinkMock = unlink as unknown as jest.Mock;
  const atomicWriteFileMock = atomicWriteFile as jest.Mock;
  const refreshQueueMock = refreshQueue as unknown as { enqueue: jest.Mock; isDomainLocked: jest.Mock };

  describe('GET /api/serp/domains', () => {
     beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.sync.mockResolvedValue(undefined);
    });

     it('masks scraper overrides when returning the domain list', async () => {
      DomainMock.findAll.mockResolvedValue([
        {
          get: jest.fn().mockReturnValue({
            ID: 1,
            domain: 'example.com',
            slug: 'example-com',
            scrapeEnabled: 1,
            search_console: null,
            scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'encrypted-value' }),
          }),
        },
      ]);

      const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = (res.json as jest.Mock).mock.calls[0][0];
      expect(payload.domains[0].scraper_settings).toEqual({ scraper_type: 'serpapi', has_api_key: true });
      expect(payload.domains[0].scrapeEnabled).toBe(true);
     });

     it('skips malformed search console JSON without failing the response', async () => {
       DomainMock.findAll.mockResolvedValue([
         {
           get: jest.fn().mockReturnValue({
             ID: 2,
             domain: 'broken.example',
             slug: 'broken-example',
             search_console: '{bad-json',
             scraper_settings: null,
           }),
         },
       ]);

       const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
       const res = createMockResponse();

       await handler(req, res);

       expect(res.status).toHaveBeenCalledWith(200);
       const payload = (res.json as jest.Mock).mock.calls[0][0];
       expect(payload.domains[0].search_console).toBe(JSON.stringify({}));
     });
  });

  describe('POST /api/serp/domains', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.sync.mockResolvedValue(undefined);
    });

    it('answers 400 for a null request body', async () => {
      const req = { method: 'POST', body: null, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(DomainMock.bulkCreate).not.toHaveBeenCalled();
    });

    it('rejects invalid or blank hostnames', async () => {
      const req = {
        method: 'POST',
        body: { domains: ['valid.com', '', 'bad host'] },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(DomainMock.bulkCreate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: expect.stringContaining('Invalid domain') }),
      }));
    });

    it('normalises (case, whitespace, leading www.) and deduplicates hostnames before insert', async () => {
      const bulkCreateResult = [
        { get: jest.fn().mockReturnValue({ domain: 'example.com', slug: 'example-com', scrapeEnabled: 1 }) },
        { get: jest.fn().mockReturnValue({ domain: 'sub.domain.com', slug: 'sub-domain-com', scrapeEnabled: 1 }) },
      ];

      DomainMock.findAll.mockResolvedValue([]);
      DomainMock.bulkCreate.mockResolvedValue(bulkCreateResult);

      const req = {
        method: 'POST',
        body: { domains: ['Example.com ', 'example.COM', 'www.example.com', 'sub.domain.com'] },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(DomainMock.bulkCreate).toHaveBeenCalledWith([
        expect.objectContaining({ domain: 'example.com', slug: 'example-com' }),
        expect.objectContaining({ domain: 'sub.domain.com', slug: 'sub-domain-com' }),
      ]);
      expect(res.status).toHaveBeenCalledWith(201);
      const responsePayload = (res.json as jest.Mock).mock.calls[0][0];
      expect(responsePayload.domains).toEqual([
        { domain: 'example.com', slug: 'example-com', scrapeEnabled: true },
        { domain: 'sub.domain.com', slug: 'sub-domain-com', scrapeEnabled: true },
      ]);
    });
  });

  describe('PUT /api/serp/domains', () => {
    let domainState: {
      domain: string;
      slug: string;
      scrapeEnabled: boolean | number;
      scraper_settings: string | null;
      business_name?: string;
    };
    let domainInstance: {
      get: jest.Mock;
      set: jest.Mock;
      save: jest.Mock;
    };
    let persistedSnapshots: Array<{ scrapeEnabled: number }>;

    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.sync.mockResolvedValue(undefined);
      process.env.SECRET = 'test-secret';

      persistedSnapshots = [];
      domainState = {
        domain: 'toggle-test.example.com',
        slug: 'toggle-test-slug',
        scrapeEnabled: true,
        scraper_settings: null,
      };

      domainInstance = {
        get: jest.fn(() => ({ ...domainState })),
        set: jest.fn((updates: Partial<typeof domainState>) => {
          Object.assign(domainState, updates);
        }),
        save: jest.fn().mockImplementation(async () => {
          persistedSnapshots.push({
            scrapeEnabled: Number(domainState.scrapeEnabled),
          });
          return domainInstance;
        }),
      };

      DomainMock.findOne.mockResolvedValue(domainInstance);
    });

     it('persists scrapeEnabled toggles', async () => {
      const disableReq = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scrapeEnabled: false },
        headers: {},
      } as unknown as NextApiRequest;
      const disableRes = createMockResponse();

      await handler(disableReq, disableRes);

      // db.sync() is now called at startup via instrumentation, not in handlers
      expect(DomainMock.findOne).toHaveBeenCalledWith({ where: { domain: domainState.domain } });
      expect(domainInstance.set).toHaveBeenCalledWith(expect.objectContaining({
        scrapeEnabled: 0,
      }));
      expect(domainInstance.save).toHaveBeenCalledTimes(1);
      expect(disableRes.status).toHaveBeenCalledWith(200);

      const disablePayload = (disableRes.json as jest.Mock).mock.calls[0][0];
      expect(disablePayload.domain).toEqual(expect.objectContaining({ scrapeEnabled: false }));
      expect(domainState.scrapeEnabled).toBe(0);
      expect(persistedSnapshots[0]).toEqual({ scrapeEnabled: 0 });

      const enableReq = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scrapeEnabled: true },
        headers: {},
      } as unknown as NextApiRequest;
      const enableRes = createMockResponse();

      await handler(enableReq, enableRes);

      expect(DomainMock.findOne).toHaveBeenCalledTimes(2);
      expect(domainInstance.set).toHaveBeenLastCalledWith(expect.objectContaining({
        scrapeEnabled: 1,
      }));
      expect(domainInstance.save).toHaveBeenCalledTimes(2);
      expect(enableRes.status).toHaveBeenCalledWith(200);

      const enablePayload = (enableRes.json as jest.Mock).mock.calls[0][0];
      expect(enablePayload.domain).toEqual(expect.objectContaining({ scrapeEnabled: true }));
      expect(domainState.scrapeEnabled).toBe(1);
      expect(persistedSnapshots[1]).toEqual({ scrapeEnabled: 1 });
    });

    it('returns 404 when attempting to update a non-existent domain', async () => {
      DomainMock.findOne.mockResolvedValueOnce(null);

      const req = {
        method: 'PUT',
        query: { domain: 'missing.example.com' },
        body: { scrapeEnabled: true },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Domain not found' }),
      }));
    });

    it('returns masked scraper_settings and safe search_console in PUT response (parity with GET)', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);
      domainState.scraper_settings = JSON.stringify({
        scraper_type: 'serpapi',
        scraping_api: cryptr.encrypt('my-api-key'),
      });
      (domainState as any).search_console = JSON.stringify({
        client_email: cryptr.encrypt('svc@project.iam.gserviceaccount.com'),
        private_key: cryptr.encrypt('-----BEGIN PRIVATE KEY-----\n...'),
        property_url: 'https://example.com',
      });

      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scrapeEnabled: true },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const { domain: returned } = (res.json as jest.Mock).mock.calls[0][0];

      // scraper_settings should be masked: no raw API key, has_api_key flag instead
      expect(returned.scraper_settings).toEqual({ scraper_type: 'serpapi', has_api_key: true });

      // search_console should be safe: sensitive fields replaced with 'true' sentinel
      const sc = JSON.parse(returned.search_console);
      expect(sc.client_email).toBe('true');
      expect(sc.private_key).toBe('true');
      expect(sc.property_url).toBe('https://example.com');
    });

    it('returns empty search_console object in PUT response when no search_console data is stored', async () => {
      (domainState as any).search_console = null;

      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scrapeEnabled: false },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const { domain: returned } = (res.json as jest.Mock).mock.calls[0][0];
      expect(returned.search_console).toBe(JSON.stringify({}));
    });

    it('persists scraper override selections with encrypted API keys', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);
      domainState.scraper_settings = JSON.stringify({
        scraper_type: 'serpapi',
        scraping_api: cryptr.encrypt('old-key'),
      });

      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scraper_settings: { scraper_type: 'serpapi', scraping_api: 'new-key' } },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const updatePayload = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
      expect(updatePayload.scraper_settings).toEqual(expect.any(String));
      const persisted = JSON.parse(updatePayload.scraper_settings);
      expect(persisted.scraper_type).toBe('serpapi');
      expect(persisted.scraping_api).not.toBe('new-key');
      expect(cryptr.decrypt(persisted.scraping_api)).toBe('new-key');
    });

    it('removes scraper overrides when reverting to the system scraper', async () => {
      domainState.scraper_settings = JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'value' });

      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scraper_settings: { scraper_type: null } },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      const updatePayload = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
      expect(updatePayload.scraper_settings).toBeNull();
    });

    it('sets business_name independently of scraper settings, alone and alongside them', async () => {
      const alone = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { business_name: 'Vontainment' },
        headers: {},
      } as unknown as NextApiRequest;
      const aloneRes = createMockResponse();

      await handler(alone, aloneRes);

      expect(aloneRes.status).toHaveBeenCalledWith(200);
      const aloneUpdate = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
      expect(aloneUpdate.business_name).toBe('Vontainment');
      expect(aloneUpdate.scraper_settings).toBeUndefined();

      const both = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: {
          business_name: 'My Business',
          scraper_settings: { scraper_type: 'serpapi', scraping_api: 'new-key' }
        },
        headers: {},
      } as unknown as NextApiRequest;
      const bothRes = createMockResponse();

      await handler(both, bothRes);

      expect(bothRes.status).toHaveBeenCalledWith(200);
      const bothUpdate = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
      expect(bothUpdate.business_name).toBe('My Business');
      expect(bothUpdate.scraper_settings).toEqual(expect.any(String));
    });

    it('returns 500 when SECRET is missing and search_console or scraper_settings are provided', async () => {
      const bodies = [
        { search_console: { client_email: 'test@example.com', private_key: 'test-key' } },
        { scraper_settings: { scraper_type: 'serpapi', scraping_api: 'new-key' } },
      ];
      for (const body of bodies) {
        delete process.env.SECRET;
        domainInstance.save.mockClear();

        const req = {
          method: 'PUT',
          query: { domain: domainState.domain },
          body,
          headers: {},
        } as unknown as NextApiRequest;

        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.objectContaining({ message: 'Server configuration error: encryption key not available' }),
        }));
        expect(domainInstance.save).not.toHaveBeenCalled();
      }
    });

    it('allows updates that do not require encryption when SECRET is missing', async () => {
      delete process.env.SECRET;

      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { 
          notification_emails: 'test@example.com'
        },
        headers: {},
      } as unknown as NextApiRequest;

      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(domainInstance.save).toHaveBeenCalled();
    });

    it('rejects partial Search Console updates with only one of client_email or private_key', async () => {
      const partials = [{ client_email: 'test@example.com' }, { private_key: 'test-key' }];
      for (const search_console of partials) {
        domainInstance.save.mockClear();

        const req = {
          method: 'PUT',
          query: { domain: domainState.domain },
          body: { search_console },
          headers: {},
        } as unknown as NextApiRequest;

        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.objectContaining({ message: 'Both client_email and private_key must be provided together for Search Console integration' }),
        }));
        expect(domainInstance.save).not.toHaveBeenCalled();
      }
    });

    // Empty and whitespace-only values count as absent: no validation or encryption, and the save proceeds
    it('treats empty or whitespace-only Search Console fields as absent and still saves', async () => {
      const blanks = [['', ''], ['   ', '  \t\n  ']];
      for (const [clientEmail, privateKey] of blanks) {
        domainInstance.save.mockClear();

        const req = {
          method: 'PUT',
          query: { domain: domainState.domain },
          body: { search_console: { client_email: clientEmail, private_key: privateKey } },
          headers: {},
        } as unknown as NextApiRequest;

        const res = createMockResponse();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(domainInstance.save).toHaveBeenCalled();
      }
    });

    afterEach(() => {
      // Always restore SECRET to prevent test pollution
      process.env.SECRET = 'test-secret';
    });
  });

  describe('DELETE /api/serp/domains', () => {
    const request = (domain = 'example.com') => ({ method: 'DELETE', query: { domain }, headers: {} } as unknown as NextApiRequest);
    let cleanupState = '{}';
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.transaction.mockImplementation(async (callback: (transaction: object) => Promise<void>) => callback({ id: 'tx' }));
      DomainMock.findOne.mockResolvedValue({ ID: 1 });
      DomainMock.destroy.mockResolvedValue(1);
      KeywordMock.destroy.mockResolvedValue(2);
      KeywordMock.findAll.mockResolvedValue([{ ID: 10 }, { ID: 11 }]);
      removeBatchMock.mockResolvedValue(undefined);
      removeLocalSCDataMock.mockResolvedValue(true);
      cleanupState = '{}';
      readFileMock.mockImplementation(async (path: string) => {
        if (path.includes('domain_cleanup_retry.json')) {
          return cleanupState;
        }
        const error = new Error('ENOENT') as Error & { code?: string };
        error.code = 'ENOENT';
        throw error;
      });
      atomicWriteFileMock.mockImplementation(async (_path: string, content: string) => {
        cleanupState = content;
      });
      refreshQueueMock.enqueue.mockImplementation(async (_taskId: string, task: () => Promise<void>) => { await task(); });
    });

    it('removes the domain ideas file, and a missing ideas file does not fail the delete', async () => {
      unlinkMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
      const res = createMockResponse(); await handler(request(), res);
      expect(unlinkMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_example\.com\.json$/));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 1, cleanup: { complete: true, failed: [], retryPending: false } }));
    });

    it('retries an earlier delete whose cleanup failed, and drops its entry once the retry succeeds', async () => {
      cleanupState = JSON.stringify({ 'older.example': [7] });
      const res = createMockResponse(); await handler(request(), res);
      expect(removeBatchMock).toHaveBeenCalledWith(new Set([7]));
      expect(removeLocalSCDataMock).toHaveBeenCalledWith('older.example');
      expect(JSON.parse(cleanupState)).toEqual({});
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when the target domain is missing', async () => {
      DomainMock.findOne.mockResolvedValue(null);
      KeywordMock.findAll.mockResolvedValueOnce([]);
      const res = createMockResponse(); await handler(request('missing.example.com'), res);
      expect(DomainMock.destroy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes keywords before the domain in one transaction and reports accurate counts', async () => {
      const order: string[] = [];
      KeywordMock.destroy.mockImplementation(async () => { order.push('keywords'); return 2; });
      DomainMock.destroy.mockImplementation(async () => { order.push('domain'); return 1; });
      const res = createMockResponse(); await handler(request(), res);
      expect(order).toEqual(['keywords', 'domain']);
      expect(KeywordMock.destroy).toHaveBeenCalledWith(expect.objectContaining({ transaction: { id: 'tx' } }));
      expect(DomainMock.destroy).toHaveBeenCalledWith(expect.objectContaining({ transaction: { id: 'tx' } }));
      expect(refreshQueueMock.enqueue).toHaveBeenCalledWith(expect.stringContaining('delete-domain-example.com-'), expect.any(Function), ['example.com']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 1, keywordsRemoved: 2, cleanup: { complete: true, failed: [], retryPending: false } }));
    });

    it('does not run auxiliary cleanup when keyword or domain deletion fails', async () => {
      for (const stage of ['keyword', 'domain']) {
        jest.clearAllMocks();
        if (stage === 'keyword') KeywordMock.destroy.mockRejectedValueOnce(new Error('keyword failure'));
        else DomainMock.destroy.mockRejectedValueOnce(new Error('domain failure'));
        const res = createMockResponse(); await handler(request(), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(removeBatchMock).not.toHaveBeenCalled();
        expect(removeLocalSCDataMock).not.toHaveBeenCalled();
      }
    });

    it('reports auxiliary failures and permits idempotent cleanup retry', async () => {
      removeBatchMock.mockRejectedValueOnce(new Error('file busy'));
      removeLocalSCDataMock.mockRejectedValueOnce(new Error('file busy'));
      const first = createMockResponse(); await handler(request('retry.example'), first);
      expect(first.json).toHaveBeenCalledWith(expect.objectContaining({ cleanup: { complete: false, failed: ['retryQueue', 'searchConsole'], retryPending: true } }));

      DomainMock.findOne.mockResolvedValue(null);
      KeywordMock.findAll.mockResolvedValueOnce([]);
      KeywordMock.destroy.mockResolvedValueOnce(0);
      DomainMock.destroy.mockResolvedValueOnce(0);
      const second = createMockResponse(); await handler(request('retry.example'), second);
      expect(second.status).toHaveBeenCalledWith(200);
      expect(second.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 0, keywordsRemoved: 0, cleanup: { complete: true, failed: [], retryPending: false } }));
      expect(removeBatchMock).toHaveBeenCalledTimes(2);
    });

    it('treats false return from local Search Console cleanup as an explicit cleanup failure', async () => {
      removeLocalSCDataMock.mockResolvedValueOnce(false);
      const res = createMockResponse(); await handler(request('cleanup-false.example'), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        cleanup: { complete: false, failed: ['searchConsole'], retryPending: true },
        SCDataRemoved: false,
      }));
    });
  });
});

describe('domain', () => {
  let Cryptr: any;
  let handler: any;
  let Domain: any;
  let verifyUser: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../database/init', () => ({
      __esModule: true,
      ensureDatabase: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../database/models/domain', () => ({
      __esModule: true,
      default: { findOne: jest.fn() },
    }));
    jest.doMock('../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../utils/apiLogging', () => ({
      __esModule: true,
      withApiLogging: (apiHandler: any) => apiHandler,
    }));
    jest.doMock('../utils/domainScraperSettings', () => ({
      __esModule: true,
      maskDomainScraperSettings: jest.fn((s: any) => s),
      parseDomainScraperSettings: jest.fn((s: any) => s),
    }));
    jest.doMock('../utils/normalizeDomain', () => ({
      __esModule: true,
      default: jest.fn((d: any) => d),
    }));
    const m0 = require('cryptr');
    Cryptr = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../pages/api/serp/domain');
    handler = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../database/models/domain');
    Domain = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../utils/verifyUser');
    verifyUser = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('./__helpers__');
    createMockResponse = m4.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const DomainMock = Domain as unknown as { findOne: jest.Mock };

  describe('/api/serp/domain handler', () => {
    let res: NextApiResponse;

    beforeEach(() => {
      jest.clearAllMocks();
      res = createMockResponse();
    });

    it('returns 401 when request is not authorized', async () => {
      verifyUserMock.mockReturnValue('unauthorized');
      const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(401);
    });

    it('returns 405 for authenticated non-GET request', async () => {
      verifyUserMock.mockReturnValue('authorized');
      const req = { method: 'POST', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(405);
      expect((res.json as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }) }),
      );
    });

    it('returns 405 for authenticated DELETE request', async () => {
      verifyUserMock.mockReturnValue('authorized');
      const req = { method: 'DELETE', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(405);
    });

    it('returns 400 when GET is called without domain query param', async () => {
      verifyUserMock.mockReturnValue('authorized');
      const req = { method: 'GET', query: {}, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(400);
    });

    it('returns 404 when domain is not found in database', async () => {
      verifyUserMock.mockReturnValue('authorized');
      DomainMock.findOne.mockResolvedValue(null);
      const req = { method: 'GET', query: { domain: 'notfound.com' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(404);
    });

    it('looks the domain up trimmed and lowercase', async () => {
      verifyUserMock.mockReturnValue('authorized');
      DomainMock.findOne.mockResolvedValue(null);
      const req = { method: 'GET', query: { domain: '  Example.COM ' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect(DomainMock.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
    });

    it('returns 200 with domain data on successful GET', async () => {
      verifyUserMock.mockReturnValue('authorized');
      DomainMock.findOne.mockResolvedValue({
        get: jest.fn().mockReturnValue({
          ID: 1,
          domain: 'example.com',
          search_console: null,
          scraper_settings: null,
        }),
      });
      const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;

      await handler(req, res);

      expect((res.status as jest.Mock)).toHaveBeenCalledWith(200);
      expect((res.json as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({ domain: expect.anything() }),
      );
    });
  });

  // The Search Console suite needs the real domain scraper settings and normalizer, and its own
  // searchConsole, refreshQueue, retryQueueManager, database and keyword mocks, so it loads in an isolated registry.
  describe('Search Console credentials stay on the server', () => {
    const originalSecret = process.env.SECRET;
    let isoDomainHandler: any;
    let isoUpdateDomain: any;
    let isoDomainModel: { findOne: jest.Mock };
    let isoVerifyUser: jest.Mock;
    let isoCheckMock: jest.Mock;
    let cryptr: any;
    let savedClientEmail: string;
    let savedPrivateKey: string;

    beforeAll(() => {
      jest.resetModules();
      jest.doMock('../database/database', () => ({
        __esModule: true,
        default: { sync: jest.fn(), transaction: jest.fn() },
      }));
      jest.doMock('../database/models/keyword', () => ({
        __esModule: true,
        default: { findAll: jest.fn(), destroy: jest.fn() },
      }));
      jest.doMock('../utils/searchConsole', () => ({
        __esModule: true,
        checkSearchConsoleIntegration: jest.fn(),
        removeLocalSCData: jest.fn(),
        integrateKeywordSCData: jest.fn(),
        readLocalSCData: jest.fn(),
      }));
      jest.doMock('../utils/refreshQueue', () => ({
        __esModule: true,
        refreshQueue: { isDomainLocked: jest.fn(), enqueue: jest.fn() },
      }));
      jest.doMock('../utils/retryQueueManager', () => ({
        __esModule: true,
        retryQueueManager: { removeBatch: jest.fn() },
      }));
      jest.doMock('../utils/domainScraperSettings', () => jest.requireActual('../utils/domainScraperSettings'));
      jest.doMock('../utils/normalizeDomain', () => jest.requireActual('../utils/normalizeDomain'));
      jest.isolateModules(() => {
        isoDomainHandler = require('../pages/api/serp/domain').default;
        isoUpdateDomain = require('../pages/api/serp/domains').updateDomain;
        isoDomainModel = require('../database/models/domain').default;
        isoVerifyUser = require('../utils/verifyUser').default;
        isoCheckMock = require('../utils/searchConsole').checkSearchConsoleIntegration;
      });
      cryptr = new Cryptr('test-secret-for-sc');
      savedClientEmail = cryptr.encrypt('svc@project.iam.gserviceaccount.com');
      savedPrivateKey = cryptr.encrypt('-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----');
    });

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret-for-sc';
      isoVerifyUser.mockReturnValue('authorized');
    });

    afterEach(() => {
      if (originalSecret === undefined) {
        delete process.env.SECRET;
      } else {
        process.env.SECRET = originalSecret;
      }
    });

    describe('GET /api/serp/domain', () => {
      it('masks saved credentials instead of returning the decrypted key', async () => {
        const stored = {
          domain: 'example.com',
          search_console: JSON.stringify({
            property_type: 'domain',
            url: '',
            client_email: savedClientEmail,
            private_key: savedPrivateKey,
          }),
          scraper_settings: null,
        };
        isoDomainModel.findOne.mockResolvedValue({ get: () => stored });
        const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoDomainHandler(req, res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        const sc = JSON.parse(body.domain.search_console);
        expect(sc.client_email).toBe('true');
        expect(sc.private_key).toBe('true');
        expect(sc.property_type).toBe('domain');
        expect(JSON.stringify(body)).not.toContain('BEGIN PRIVATE KEY');
        expect(JSON.stringify(body)).not.toContain('svc@project');
      });
    });

    describe('PUT /api/serp/domains (updateDomain)', () => {
      const buildInstance = () => {
        const current: Record<string, any> = {
          domain: 'example.com',
          search_console: JSON.stringify({
            property_type: 'domain',
            url: '',
            client_email: savedClientEmail,
            private_key: savedPrivateKey,
          }),
          scraper_settings: null,
          lastUpdated: '',
          added: '',
          scrapeEnabled: 1,
        };
        const instance = {
          get: jest.fn(() => ({ ...current })),
          set: jest.fn((updates: Record<string, any>) => Object.assign(current, updates)),
          save: jest.fn().mockResolvedValue(undefined),
        };
        return { instance, current };
      };

      it('keeps the stored encrypted credentials when the form sends the saved marker back', async () => {
        const { instance, current } = buildInstance();
        isoDomainModel.findOne.mockResolvedValue(instance);
        const req = {
          method: 'PUT',
          query: { domain: 'example.com' },
          body: { search_console: { property_type: 'url', url: 'https://example.com/', client_email: 'true', private_key: 'true' } },
          headers: {},
        } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoUpdateDomain(req, res);

        expect(isoCheckMock).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        const stored = JSON.parse(current.search_console);
        expect(stored.client_email).toBe(savedClientEmail);
        expect(stored.private_key).toBe(savedPrivateKey);
        expect(stored.property_type).toBe('url');
        expect(stored.url).toBe('https://example.com/');
      });

      it('rejects a save that sends only one of the two credentials as the marker', async () => {
        const { instance } = buildInstance();
        isoDomainModel.findOne.mockResolvedValue(instance);
        const req = {
          method: 'PUT',
          query: { domain: 'example.com' },
          body: { search_console: { property_type: 'domain', url: '', client_email: 'new@example.com', private_key: 'true' } },
          headers: {},
        } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoUpdateDomain(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(instance.save).not.toHaveBeenCalled();
      });

    });
  });
});

describe('keyword', () => {
  let handler: any;
  let Keyword: any;
  let verifyUser: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../database/models/keyword', () => ({
      __esModule: true,
      default: { findOne: jest.fn() },
    }));
    jest.doMock('../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../utils/apiLogging', () => ({
      __esModule: true,
      withApiLogging: (apiHandler: any) => apiHandler,
    }));
    const m0 = require('../pages/api/serp/keyword');
    handler = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../database/models/keyword');
    Keyword = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../utils/verifyUser');
    verifyUser = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('./__helpers__');
    createMockResponse = m3.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const KeywordMock = Keyword as unknown as { findOne: jest.Mock };

  describe('GET /api/serp/keyword', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
    });

    it.each(['12abc', '1.5', '-3', '0', '1e2', ' '])('rejects the malformed id %p with 400', async (id) => {
      const res = createMockResponse();
      await handler({ method: 'GET', query: { id }, headers: {} } as unknown as NextApiRequest, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(KeywordMock.findOne).not.toHaveBeenCalled();
    });

    it('looks up a plain integer id', async () => {
      KeywordMock.findOne.mockResolvedValue(null);
      const res = createMockResponse();
      await handler({ method: 'GET', query: { id: '12' }, headers: {} } as unknown as NextApiRequest, res);

      expect(KeywordMock.findOne).toHaveBeenCalledWith({ where: { ID: 12 } });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

describe('domains', () => {
  let getdomainStats: any;
  let Keyword: any;
  let readLocalSCData: any;
  jest.isolateModules(() => {
    jest.doMock('../database/models/keyword', () => ({
      __esModule: true,
      default: { findAll: jest.fn() },
    }));
    jest.doMock('../utils/searchConsole', () => ({
      __esModule: true,
      readLocalSCData: jest.fn(),
    }));
    const m0 = require('../utils/domains');
    getdomainStats = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../database/models/keyword');
    Keyword = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../utils/searchConsole');
    readLocalSCData = m2.readLocalSCData;
  });

  const mockFindAll = (Keyword as any).findAll as jest.Mock;
  const mockReadLocalSCData = readLocalSCData as jest.Mock;

  describe('getdomainStats', () => {
    beforeEach(() => {
      mockFindAll.mockReset();
      mockReadLocalSCData.mockReset();
    });

    it('omits avgPosition and mapPackKeywords when the domain lacks persisted values', async () => {
      // Aggregate query returns no rows for this domain (no keywords)
      mockFindAll.mockResolvedValue([]);
      mockReadLocalSCData.mockResolvedValue(null);

      const domain = {
        ID: 1,
        domain: 'example.com',
        slug: 'example-com',
        notification: false,
     
        notification_emails: '',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].keywordsTracked).toBe(0);
      expect(result[0].avgPosition).toBeUndefined();
      expect(result[0].mapPackKeywords).toBeUndefined();
    });

    it('returns keywordsTracked and keywordsUpdated from the aggregated query result', async () => {
      // Aggregate query returns one row with count=3 and maxLastUpdated='2023-01-03'
      mockFindAll.mockResolvedValue([
        { domain: 'example.com', keywordsTracked: '3', maxLastUpdated: '2023-01-03' },
      ]);
      mockReadLocalSCData.mockResolvedValue(null);

      const domain = {
        ID: 1,
        domain: 'example.com',
        slug: 'example-com',
        notification: false,
     
        notification_emails: '',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].keywordsTracked).toBe(3);
      expect(result[0].avgPosition).toBeUndefined();
      expect(result[0].mapPackKeywords).toBeUndefined();
      expect(result[0].keywordsUpdated).toBe('2023-01-03T00:00:00.000Z');
    });

    it('uses persisted avgPosition and mapPackKeywords from domain when available', async () => {
      mockFindAll.mockResolvedValue([
        { domain: 'persisted.com', keywordsTracked: '2', maxLastUpdated: '2023-01-02' },
      ]);
      mockReadLocalSCData.mockResolvedValue(null);

      const domain = {
        ID: 1,
        domain: 'persisted.com',
        slug: 'persisted-com',
        notification: false,
     
        notification_emails: '',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        avgPosition: 5, // Persisted value, a whole number
        mapPackKeywords: 3, // Persisted value
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].keywordsTracked).toBe(2);
      expect(result[0].avgPosition).toBe(5); // Uses persisted value from domain
      expect(result[0].mapPackKeywords).toBe(3); // Uses persisted value from domain
    });

    it('removes invalid persisted stats when values are zero or non-numeric', async () => {
      mockFindAll.mockResolvedValue([]);
      mockReadLocalSCData.mockResolvedValue(null);

      const domain = {
        ID: 1,
        domain: 'stale-stats.com',
        slug: 'stale-stats-com',
        notification: false,
     
        notification_emails: '',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        avgPosition: 0,
        mapPackKeywords: Number.NaN,
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].avgPosition).toBeUndefined();
      expect(result[0].mapPackKeywords).toBeUndefined();
    });

    it('issues a single findAll call regardless of how many domains are passed', async () => {
      mockFindAll.mockResolvedValue([
        { domain: 'a.com', keywordsTracked: '1', maxLastUpdated: '2023-01-01' },
        { domain: 'b.com', keywordsTracked: '2', maxLastUpdated: '2023-01-02' },
      ]);
      mockReadLocalSCData.mockResolvedValue(null);

      const domains = [
        { ID: 1, domain: 'a.com', slug: 'a-com', notification: false, notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
        { ID: 2, domain: 'b.com', slug: 'b-com', notification: false, notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
      ] as any[];

      await getdomainStats(domains);

      // Only one findAll call regardless of domain count (not N calls)
      expect(mockFindAll).toHaveBeenCalledTimes(1);
    });

    it('compares the last 7 Search Console days with the 7 days before them', async () => {
      mockFindAll.mockResolvedValue([]);
      const dayStat = (clicks: number, impressions: number, position: number) => ({ clicks, impressions, ctr: 0, position });
      mockReadLocalSCData.mockResolvedValue({
        stats: [
          ...Array.from({ length: 7 }, () => dayStat(1, 10, 20)), // previous 7 days
          ...Array.from({ length: 7 }, () => dayStat(2, 30, 10)), // current 7 days
        ],
      });

      const domain = {
        ID: 1, domain: 'sc.com', slug: 'sc-com', notification: false, notification_emails: '',
        lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z',
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].scVisits).toBe(14);
      expect(result[0].scImpressions).toBe(210);
      expect(result[0].scPosition).toBe(10);
      expect(result[0].scVisitsPrev).toBe(7);
      expect(result[0].scImpressionsPrev).toBe(70);
      expect(result[0].scPositionPrev).toBe(20);
    });

    it('omits the Search Console previous values when fewer than 14 days are stored', async () => {
      mockFindAll.mockResolvedValue([]);
      const dayStat = { clicks: 1, impressions: 5, ctr: 0, position: 8 };
      mockReadLocalSCData.mockResolvedValue({ stats: Array.from({ length: 10 }, () => dayStat) });

      const domain = {
        ID: 1, domain: 'short.com', slug: 'short-com', notification: false, notification_emails: '',
        lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z',
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].scVisits).toBe(7);
      expect(result[0].scVisitsPrev).toBeUndefined();
      expect(result[0].scImpressionsPrev).toBeUndefined();
      expect(result[0].scPositionPrev).toBeUndefined();
    });

    it('falls back to domain.lastUpdated when there are no keywords', async () => {
      mockFindAll.mockResolvedValue([]); // no aggregate row for domain
      mockReadLocalSCData.mockResolvedValue(null);

      const domain = {
        ID: 1,
        domain: 'empty.com',
        slug: 'empty-com',
        notification: false,
     
        notification_emails: '',
        lastUpdated: '2022-06-15T12:00:00.000Z',
        added: '2022-06-01T00:00:00.000Z',
      } as any;

      const result = await getdomainStats([domain]);

      expect(result[0].keywordsTracked).toBe(0);
      expect(result[0].keywordsUpdated).toBe('2022-06-15T12:00:00.000Z');
    });

    it('does not change the domain objects it was given', async () => {
      (Keyword.findAll as jest.Mock).mockResolvedValue([{ domain: 'example.com', keywordsTracked: 2, maxLastUpdated: null }]);
      (readLocalSCData as jest.Mock).mockResolvedValue(false);
      const input = { domain: 'example.com', lastUpdated: '2022-06-15T12:00:00.000Z', avgPosition: 0 } as any;
      const snapshot = JSON.stringify(input);

      const result = await getdomainStats([input]);

      expect(JSON.stringify(input)).toBe(snapshot);
      expect(result[0]).not.toBe(input);
      expect(result[0].keywordsTracked).toBe(2);
    });
  });
});

describe('keywordMeta', () => {
  const makeKeyword = (overrides: Partial<KeywordType>): KeywordType => ({
     ID: 1,
     keyword: 'alpha',
     device: 'desktop',
     country: 'US',
     domain: 'example.com',
     location: '',
     tags: [],
     lastUpdated: '2024-01-01T00:00:00.000Z',
     added: '2024-01-01T00:00:00.000Z',
     position: 1,
     volume: 0,
     sticky: false,
     history: {},
     lastResult: [],
     url: '',
     updating: false,
     lastUpdateError: false,
     ...overrides,
  } as KeywordType);

  describe('getDomainTags', () => {
     it('returns an empty list when there are no keywords', () => {
        expect(getDomainTags([])).toEqual([]);
     });

     it('returns unique, non-blank tags across keywords', () => {
        const keywords = [
           makeKeyword({ ID: 1, tags: ['seo', ' ', ''] }),
           makeKeyword({ ID: 2, tags: ['seo', 'content'] }),
        ];
        expect(getDomainTags(keywords)).toEqual(['seo', 'content']);
     });
  });

  describe('getDomainLocations', () => {
     it('returns an empty list when no keyword has a location', () => {
        expect(getDomainLocations([makeKeyword({ location: '' })])).toEqual([]);
        expect(getDomainLocations([makeKeyword({ location: undefined })])).toEqual([]);
     });

     it('returns unique, sorted, non-empty locations', () => {
        const keywords = [
           makeKeyword({ ID: 1, location: 'US' }),
           makeKeyword({ ID: 2, location: 'Austin,TX,US' }),
           makeKeyword({ ID: 3, location: 'US' }),
           makeKeyword({ ID: 4, location: '  ' }),
        ];
        expect(getDomainLocations(keywords)).toEqual(['Austin,TX,US', 'US']);
     });});

  describe('buildKeywordAddPayloads', () => {
     const items = [
        { keyword: 'alpha', country: 'US' },
        { keyword: 'beta', country: 'DE' },
     ];

     it('creates one payload per item per device with the chosen tags and location', () => {
        const payloads = buildKeywordAddPayloads({
           items,
           domain: 'example.com',
           devices: ['desktop', 'mobile'],
           tags: ['seo', 'content'],
           location: 'Austin,TX,United States',
        });

        expect(payloads).toHaveLength(4);
        expect(payloads[0]).toEqual({
           keyword: 'alpha',
           device: 'desktop',
           country: 'US',
           domain: 'example.com',
           tags: 'seo, content',
           location: 'Austin,TX,United States',
        });
        expect(payloads.map((p) => `${p.keyword}:${p.device}`)).toEqual([
           'alpha:desktop', 'alpha:mobile', 'beta:desktop', 'beta:mobile',
        ]);
     });

     it('keeps a blank location and each keyword country when no location is chosen', () => {
        const payloads = buildKeywordAddPayloads({
           items,
           domain: 'example.com',
           devices: ['desktop'],
           tags: [],
           location: '',
        });

        expect(payloads.map((p) => p.location)).toEqual(['', '']);
        expect(payloads.map((p) => p.country)).toEqual(['US', 'DE']);
        expect(payloads.every((p) => p.tags === '')).toBe(true);
     });

     it('uses the market country as the keyword country so it matches the chosen location', () => {
        const cases = [
           // Country-only location: the picked country is used.
           { location: '', country: 'GB' },
           // Location-derived market: the location's country is used.
           { location: 'London,England,United Kingdom', country: undefined },
        ];
        for (const { location, country } of cases) {
           const payloads = buildKeywordAddPayloads({
              items: [{ keyword: 'alpha', country: 'US' }],
              domain: 'example.com',
              devices: ['desktop'],
              tags: [],
              location,
              country,
           });
           expect(payloads).toEqual([
              expect.objectContaining({ keyword: 'alpha', country: 'GB', location }),
           ]);
        }
     });

     it('returns no payloads when there are no devices or items', () => {
        expect(buildKeywordAddPayloads({ items: [], domain: 'a.com', devices: ['desktop'], tags: [], location: '' })).toEqual([]);
        expect(buildKeywordAddPayloads({ items, domain: 'a.com', devices: [], tags: [], location: '' })).toEqual([]);
     });
  });

  describe('scraperAllowsCity', () => {
     it('returns false when settings are missing, otherwise reads allowsCity from the selected scraper', () => {
        expect(scraperAllowsCity(undefined)).toBe(false);

        const settings = {
           scraper_type: 'serpapi',
           available_scapers: [
              { label: 'Scrape', value: 'scrapingant', allowsCity: false },
              { label: 'SerpAPI', value: 'serpapi', allowsCity: true },
           ],
        } as unknown as SettingsType;
        expect(scraperAllowsCity(settings)).toBe(true);
     });
  });

  describe('planLocationUpdate', () => {
     const row = (ID: number, keyword: string, country = 'US', device = 'desktop', domain = 'example.com', location = '') => ({ ID, keyword, country, device, domain, location });

     it('accepts every keyword when nothing else is tracked in the new location', () => {
        expect(planLocationUpdate([row(1, 'alpha'), row(2, 'beta')], [], 'GB', 'London')).toEqual({ acceptedIDs: [1, 2], skipped: [] });
     });

     it('skips a keyword whose destination is already tracked by another row, in the same or a new country', () => {
        const result = planLocationUpdate([row(1, 'alpha'), row(2, 'beta')], [row(9, 'alpha', 'GB', 'desktop', 'example.com', 'London')], 'GB', 'London');
        expect(result).toEqual({ acceptedIDs: [2], skipped: ['alpha'] });
        expect(planLocationUpdate([row(1, 'plumber', 'US', 'desktop', 'example.com', 'Miami')], [row(2, 'plumber', 'US', 'desktop', 'example.com', 'Orlando')], 'US', 'Orlando')).toEqual({ acceptedIDs: [], skipped: ['plumber'] });
     });

     it('treats the same keyword on another device or domain as not a duplicate', () => {
        const others = [row(9, 'alpha', 'GB', 'mobile', 'example.com', 'London'), row(10, 'alpha', 'GB', 'desktop', 'other.com', 'London'), row(11, 'alpha', 'GB', 'desktop', 'example.com', 'Miami')];
        expect(planLocationUpdate([row(1, 'alpha')], others, 'GB', 'London')).toEqual({ acceptedIDs: [1], skipped: [] });
     });

     it('keeps only the first of two selected keywords that would become the same tracked keyword', () => {
        const result = planLocationUpdate([row(1, 'alpha'), row(2, 'alpha')], [], 'GB', 'London');
        expect(result).toEqual({ acceptedIDs: [1], skipped: ['alpha'] });
     });

     it('returns nothing to update when there are no selected keywords', () => {
        expect(planLocationUpdate([], [row(9, 'alpha')], 'GB', 'London')).toEqual({ acceptedIDs: [], skipped: [] });
     });

  });

  describe('getLocationUpdateMessage', () => {
     it('reports a plain update with the right plural', () => {
        expect(getLocationUpdateMessage(1)).toBe('Updated 1 keyword.');
        expect(getLocationUpdateMessage(3)).toBe('Updated 3 keywords.');
     });

     it('reports skipped keywords alongside the updated count', () => {
        expect(getLocationUpdateMessage(2, ['alpha'])).toBe('Updated 2 keywords. Skipped 1 already tracked in that location: alpha.');
     });

     it('says nothing changed when every keyword was skipped', () => {
        expect(getLocationUpdateMessage(0, ['alpha', 'beta'])).toBe('No keywords changed. 2 already tracked in that location: alpha, beta.');
     });
  });

  describe('splitAlreadyTracked', () => {
     const payload = (keyword: string, device: 'desktop' | 'mobile', country = 'US') => ({
        keyword, device, country, domain: 'example.com', tags: '', location: country,
     });

     it('keeps untracked rows and reports tracked keyword and device pairs', () => {
        const lookup = { 'alpha:US:desktop': true };
        const result = splitAlreadyTracked([payload('alpha', 'desktop'), payload('alpha', 'mobile'), payload('beta', 'desktop')], lookup);
        expect(result.payloads.map((p) => `${p.keyword}:${p.device}`)).toEqual(['alpha:mobile', 'beta:desktop']);
        expect(result.skipped).toEqual(['alpha (desktop)']);
     });

     it('does not treat the same keyword in another country as tracked', () => {
        const result = splitAlreadyTracked([payload('alpha', 'desktop', 'GB')], { 'alpha:US:desktop': true });
        expect(result.payloads).toHaveLength(1);
        expect(result.skipped).toEqual([]);
     });

     it('returns nothing to add when everything is tracked', () => {
        const result = splitAlreadyTracked([payload('alpha', 'desktop')], { 'alpha:US:desktop': true });
        expect(result).toEqual({ payloads: [], skipped: ['alpha (desktop)'] });
     });
  });

  describe('getAddKeywordsMessage', () => {
     it('keeps the original wording when nothing was skipped', () => {
        expect(getAddKeywordsMessage(3)).toBe('Keywords Added Successfully!');
     });

     it('reports added and skipped keywords', () => {
        expect(getAddKeywordsMessage(2, ['alpha (desktop)'])).toBe('Added 2 keywords. Skipped 1 already tracked: alpha (desktop).');
        expect(getAddKeywordsMessage(1, ['alpha (desktop)'])).toBe('Added 1 keyword. Skipped 1 already tracked: alpha (desktop).');
     });

     it('says nothing was added when every row was skipped', () => {
        expect(getAddKeywordsMessage(0, ['alpha (desktop)'])).toBe('No keywords added. 1 already tracked: alpha (desktop).');
     });
  });
});
