import type { NextApiRequest } from 'next';
import Cryptr from 'cryptr';
import { readFile, unlink } from 'fs/promises';
import handler from '../../pages/api/domains';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import { removeLocalSCData } from '../../utils/searchConsole';
import { retryQueueManager } from '../../utils/retryQueueManager';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { refreshQueue } from '../../utils/refreshQueue';
import { createMockResponse } from '../__helpers__';

jest.mock('../../utils/thumbnails', () => ({
  __esModule: true,
  ensureThumbnails: jest.fn().mockResolvedValue(undefined),
  deleteThumbnails: jest.fn().mockResolvedValue(undefined),
}));

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
  default: { findOne: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { destroy: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../utils/searchConsole', () => ({
  __esModule: true,
  checkSearchConsoleIntegration: jest.fn(() => ({ isValid: true })),
  removeLocalSCData: jest.fn(),
}));

jest.mock('../../utils/retryQueueManager', () => ({ retryQueueManager: { removeBatch: jest.fn() } }));
jest.mock('../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
jest.mock('fs/promises', () => ({ readFile: jest.fn(), mkdir: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/fileLock', () => ({ withFileLock: (_path: string, section: () => Promise<unknown>) => section() }));
jest.mock('../../utils/refreshQueue', () => ({
  refreshQueue: {
    enqueue: jest.fn(async (_taskId: string, task: () => Promise<void>) => { await task(); }),
    isDomainLocked: jest.fn(() => false),
  },
}));

jest.mock('../../utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

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

describe('GET /api/domains', () => {
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

describe('POST /api/domains', () => {
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

describe('PUT /api/domains', () => {
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

describe('DELETE /api/domains', () => {
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
