import type { NextApiRequest } from 'next';

describe('domains route', () => {
  let Cryptr: any;
  let handler: any;
  let db: any;
  let Domain: any;
  let verifyUser: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../../../database/init', () => ({
      __esModule: true,
      ensureDatabase: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../../database/models/domain', () => ({
      __esModule: true,
      default: { findOne: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../../../database/models/keyword', () => ({
      __esModule: true,
      default: { destroy: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../../../utils/searchConsole', () => ({
      __esModule: true,
      checkSearchConsoleIntegration: jest.fn(() => ({ isValid: true })),
      removeLocalSCData: jest.fn(),
    }));
    jest.doMock('../../../utils/retryQueueManager', () => ({ retryQueueManager: { removeBatch: jest.fn() } }));
    jest.doMock('../../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
    jest.doMock('fs/promises', () => ({ readFile: jest.fn(), mkdir: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('../../../utils/fileLock', () => ({ withFileLock: (_path: string, section: () => Promise<unknown>) => section() }));
    jest.doMock('../../../utils/refreshQueue', () => ({
      refreshQueue: {
        enqueue: jest.fn(async (_taskId: string, task: () => Promise<void>) => { await task(); }),
        isDomainLocked: jest.fn(() => false),
        reserveDomains: jest.fn(() => jest.fn()),
      },
    }));
    jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
    const m0 = require('cryptr');
    Cryptr = m0 && m0.__esModule ? m0.default : m0;
    const m2 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domains/route'));
    handler = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../../database/database');
    db = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../../../database/models/domain');
    Domain = m4 && m4.__esModule ? m4.default : m4;
    const m6 = require('../../../utils/verifyUser');
    verifyUser = m6 && m6.__esModule ? m6.default : m6;
    const m11 = require('../../__helpers__');
    createMockResponse = m11.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const dbMock = db as unknown as { sync: jest.Mock; transaction: jest.Mock };
  const DomainMock = Domain as unknown as { findOne: jest.Mock; destroy: jest.Mock; bulkCreate: jest.Mock; findAll: jest.Mock };

  const originalSecret = process.env.SECRET;

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

    it.each([
      [{}, null, 'Domain is Required!'],
      [{ domain: 'example.com' }, [], 'Request body must be a JSON object.'],
      [{ domain: 'example.com' }, null, 'Request body must be a JSON object.'],
    ])('rejects missing domain or non-object payloads before reading the row (%p)', async (query, body, message) => {
      const req = { method: 'PUT', query, body, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message }) }));
      expect(DomainMock.findOne).not.toHaveBeenCalled();
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

    it.each([
      ['custom', 5, 'custom', 5, true],
      ['unknown', 99, '', 10, true],
      ['', -3, '', 0, true],
      ['basic', '5', 'basic', undefined, false],
    ])('normalizes scrape strategy and pagination options (%p, %p)', async (strategy, limit, expectedStrategy, expectedLimit, writesLimit) => {
      const req = {
        method: 'PUT',
        query: { domain: domainState.domain },
        body: { scrape_strategy: strategy, scrape_pagination_limit: limit },
        headers: {},
      } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      const update = domainInstance.set.mock.calls[domainInstance.set.mock.calls.length - 1][0];
      expect(update.scrape_strategy).toBe(expectedStrategy);
      if (writesLimit) expect(update.scrape_pagination_limit).toBe(expectedLimit);
      else expect(update).not.toHaveProperty('scrape_pagination_limit');
      expect(res.status).toHaveBeenCalledWith(200);
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
      if (originalSecret === undefined) delete process.env.SECRET;
      else process.env.SECRET = originalSecret;
    });
  });

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
      jest.doMock('../../../database/database', () => ({
        __esModule: true,
        default: { sync: jest.fn(), transaction: jest.fn() },
      }));
      jest.doMock('../../../database/models/keyword', () => ({
        __esModule: true,
        default: { findAll: jest.fn(), destroy: jest.fn() },
      }));
      jest.doMock('../../../utils/searchConsole', () => ({
        __esModule: true,
        checkSearchConsoleIntegration: jest.fn(),
        removeLocalSCData: jest.fn(),
        integrateKeywordSCData: jest.fn(),
        readLocalSCData: jest.fn(),
      }));
      jest.doMock('../../../utils/refreshQueue', () => ({
        __esModule: true,
        refreshQueue: { isDomainLocked: jest.fn(), enqueue: jest.fn() },
      }));
      jest.doMock('../../../utils/retryQueueManager', () => ({
        __esModule: true,
        retryQueueManager: { removeBatch: jest.fn() },
      }));
      jest.doMock('../../../utils/domainScraperSettings', () => jest.requireActual('../../../utils/domainScraperSettings'));
      jest.doMock('../../../utils/normalizeDomain', () => jest.requireActual('../../../utils/normalizeDomain'));
      jest.isolateModules(() => {
        isoDomainHandler = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domain/route')).default;
        isoUpdateDomain = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domains/route')).default;
        isoDomainModel = require('../../../database/models/domain').default;
        isoVerifyUser = require('../../../utils/verifyUser').default;
        isoCheckMock = require('../../../utils/searchConsole').checkSearchConsoleIntegration;
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
      it.each([
        [{}, 400],
        [{ domain: 'example.com' }, 404],
      ])('validates a domain lookup before returning a row (%p)', async (query, status) => {
        isoDomainModel.findOne.mockResolvedValue(null);
        const req = { method: 'GET', query, headers: {} } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoDomainHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(status);
        if (status === 404) expect(isoDomainModel.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
      });

      it('returns a server error when the domain lookup fails', async () => {
        isoDomainModel.findOne.mockRejectedValue(new Error('database unavailable'));
        const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoDomainHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });

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
      jest.doMock('../../../database/database', () => ({
        __esModule: true,
        default: { sync: jest.fn(), transaction: jest.fn() },
      }));
      jest.doMock('../../../database/models/keyword', () => ({
        __esModule: true,
        default: { findAll: jest.fn(), destroy: jest.fn() },
      }));
      jest.doMock('../../../utils/searchConsole', () => ({
        __esModule: true,
        checkSearchConsoleIntegration: jest.fn(),
        removeLocalSCData: jest.fn(),
        integrateKeywordSCData: jest.fn(),
        readLocalSCData: jest.fn(),
      }));
      jest.doMock('../../../utils/refreshQueue', () => ({
        __esModule: true,
        refreshQueue: { isDomainLocked: jest.fn(), enqueue: jest.fn() },
      }));
      jest.doMock('../../../utils/retryQueueManager', () => ({
        __esModule: true,
        retryQueueManager: { removeBatch: jest.fn() },
      }));
      jest.doMock('../../../utils/domainScraperSettings', () => jest.requireActual('../../../utils/domainScraperSettings'));
      jest.doMock('../../../utils/normalizeDomain', () => jest.requireActual('../../../utils/normalizeDomain'));
      jest.isolateModules(() => {
        isoDomainHandler = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domain/route')).default;
        isoUpdateDomain = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domains/route')).default;
        isoDomainModel = require('../../../database/models/domain').default;
        isoVerifyUser = require('../../../utils/verifyUser').default;
        isoCheckMock = require('../../../utils/searchConsole').checkSearchConsoleIntegration;
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
      it.each([
        [{}, 400],
        [{ domain: 'example.com' }, 404],
      ])('validates a domain lookup before returning a row (%p)', async (query, status) => {
        isoDomainModel.findOne.mockResolvedValue(null);
        const req = { method: 'GET', query, headers: {} } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoDomainHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(status);
        if (status === 404) expect(isoDomainModel.findOne).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
      });

      it('returns a server error when the domain lookup fails', async () => {
        isoDomainModel.findOne.mockRejectedValue(new Error('database unavailable'));
        const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;
        const res = createMockResponse();

        await isoDomainHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      });

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
  })
});
