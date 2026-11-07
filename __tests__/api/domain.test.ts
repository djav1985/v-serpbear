import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import handler from '../../pages/api/serp/domain';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../database/init', () => ({
  __esModule: true,
  ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

jest.mock('../../utils/domainScraperSettings', () => ({
  __esModule: true,
  maskDomainScraperSettings: jest.fn((s: any) => s),
  parseDomainScraperSettings: jest.fn((s: any) => s),
}));

jest.mock('../../utils/normalizeDomain', () => ({
  __esModule: true,
  default: jest.fn((d: any) => d),
}));

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
    jest.doMock('../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../../database/models/keyword', () => ({
      __esModule: true,
      default: { findAll: jest.fn(), destroy: jest.fn() },
    }));
    jest.doMock('../../utils/searchConsole', () => ({
      __esModule: true,
      checkSearchConsoleIntegration: jest.fn(),
      removeLocalSCData: jest.fn(),
      integrateKeywordSCData: jest.fn(),
      readLocalSCData: jest.fn(),
    }));
    jest.doMock('../../utils/refreshQueue', () => ({
      __esModule: true,
      refreshQueue: { isDomainLocked: jest.fn(), enqueue: jest.fn() },
    }));
    jest.doMock('../../utils/retryQueueManager', () => ({
      __esModule: true,
      retryQueueManager: { removeBatch: jest.fn() },
    }));
    jest.doMock('../../utils/domainScraperSettings', () => jest.requireActual('../../utils/domainScraperSettings'));
    jest.doMock('../../utils/normalizeDomain', () => jest.requireActual('../../utils/normalizeDomain'));
    jest.isolateModules(() => {
      isoDomainHandler = require('../../pages/api/serp/domain').default;
      isoUpdateDomain = require('../../pages/api/serp/domains').updateDomain;
      isoDomainModel = require('../../database/models/domain').default;
      isoVerifyUser = require('../../utils/verifyUser').default;
      isoCheckMock = require('../../utils/searchConsole').checkSearchConsoleIntegration;
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
