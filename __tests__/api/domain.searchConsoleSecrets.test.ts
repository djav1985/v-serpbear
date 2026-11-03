import type { NextApiRequest } from 'next';
import Cryptr from 'cryptr';
import domainHandler from '../../pages/api/domain';
import { updateDomain } from '../../pages/api/domains';
import Domain from '../../database/models/domain';
import verifyUser from '../../utils/verifyUser';
import { checkSearchConsoleIntegration } from '../../utils/searchConsole';
import { createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../../database/init', () => ({
  __esModule: true,
  ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), destroy: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

jest.mock('../../utils/searchConsole', () => ({
  __esModule: true,
  checkSearchConsoleIntegration: jest.fn(),
  removeLocalSCData: jest.fn(),
  integrateKeywordSCData: jest.fn(),
  readLocalSCData: jest.fn(),
}));

jest.mock('../../utils/refreshQueue', () => ({
  __esModule: true,
  refreshQueue: { isDomainLocked: jest.fn(), enqueue: jest.fn() },
}));

jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn() },
}));

const verifyUserMock = verifyUser as unknown as jest.Mock;
const DomainMock = Domain as unknown as { findOne: jest.Mock };
const checkMock = checkSearchConsoleIntegration as unknown as jest.Mock;

describe('Search Console credentials stay on the server', () => {
  const originalSecret = process.env.SECRET;
  const cryptr = new Cryptr('test-secret-for-sc');
  const savedClientEmail = cryptr.encrypt('svc@project.iam.gserviceaccount.com');
  const savedPrivateKey = cryptr.encrypt('-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret-for-sc';
    verifyUserMock.mockReturnValue('authorized');
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
  });

  describe('GET /api/domain', () => {
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
      DomainMock.findOne.mockResolvedValue({ get: () => stored });
      const req = { method: 'GET', query: { domain: 'example.com' }, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await domainHandler(req, res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      const sc = JSON.parse(body.domain.search_console);
      expect(sc.client_email).toBe('true');
      expect(sc.private_key).toBe('true');
      expect(sc.property_type).toBe('domain');
      expect(JSON.stringify(body)).not.toContain('BEGIN PRIVATE KEY');
      expect(JSON.stringify(body)).not.toContain('svc@project');
    });
  });

  describe('PUT /api/domains (updateDomain)', () => {
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
      DomainMock.findOne.mockResolvedValue(instance);
      const req = {
        method: 'PUT',
        query: { domain: 'example.com' },
        body: { search_console: { property_type: 'url', url: 'https://example.com/', client_email: 'true', private_key: 'true' } },
        headers: {},
      } as unknown as NextApiRequest;
      const res = createMockResponse();

      await updateDomain(req, res);

      expect(checkMock).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      const stored = JSON.parse(current.search_console);
      expect(stored.client_email).toBe(savedClientEmail);
      expect(stored.private_key).toBe(savedPrivateKey);
      expect(stored.property_type).toBe('url');
      expect(stored.url).toBe('https://example.com/');
    });

    it('rejects a save that sends only one of the two credentials as the marker', async () => {
      const { instance } = buildInstance();
      DomainMock.findOne.mockResolvedValue(instance);
      const req = {
        method: 'PUT',
        query: { domain: 'example.com' },
        body: { search_console: { property_type: 'domain', url: '', client_email: 'new@example.com', private_key: 'true' } },
        headers: {},
      } as unknown as NextApiRequest;
      const res = createMockResponse();

      await updateDomain(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(instance.save).not.toHaveBeenCalled();
    });

    it('rejects a notification interval outside the allowed values', async () => {
      const { instance } = buildInstance();
      DomainMock.findOne.mockResolvedValue(instance);
      const req = {
        method: 'PUT',
        query: { domain: 'example.com' },
        body: { notification_interval: 'hourly' },
        headers: {},
      } as unknown as NextApiRequest;
      const res = createMockResponse();

      await updateDomain(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(instance.save).not.toHaveBeenCalled();
    });
  });
});
