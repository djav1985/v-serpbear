import type { NextApiRequest } from 'next';

describe('domains route', () => {
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

  describe('GET /api/serp/domains', () => {
     beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.sync.mockResolvedValue(undefined);
    });

     it.each([
       [{ withstats: 'sometimes' }, 'Invalid boolean value'],
       [{ domains: 'example.com' }, 'The domains parameter requires withstats=true'],
       [{ withstats: 'true', domains: '' }, 'between 1 and 8 valid domain names'],
       [{ withstats: 'true', domains: 'bad host' }, 'between 1 and 8 valid domain names'],
       [{ withstats: 'true', domains: 'a.com,b.com,c.com,d.com,e.com,f.com,g.com,h.com,i.com' }, 'between 1 and 8 valid domain names'],
     ])('rejects invalid domain-list query values before loading domains (%p)', async (query, message) => {
       const req = { method: 'GET', headers: {}, query } as unknown as NextApiRequest;
       const res = createMockResponse();

       await handler(req, res);

       expect(res.status).toHaveBeenCalledWith(400);
       expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining(message) }) }));
       expect(DomainMock.findAll).not.toHaveBeenCalled();
     });

     it('returns 500 when loading the domain list fails', async () => {
       DomainMock.findAll.mockRejectedValue(new Error('database unavailable'));
       const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
       const res = createMockResponse();

       await handler(req, res);

       expect(res.status).toHaveBeenCalledWith(500);
       expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }) }));
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

    it.each([
      [{ domains: [] }, 'Necessary data missing.'],
      [{ domains: 'example.com' }, 'Necessary data missing.'],
      [{ domains: [123] }, 'Invalid domain(s): blank domain'],
    ])('rejects empty or malformed domain lists before database writes (%p)', async (body, message) => {
      const req = { method: 'POST', body, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message }) }));
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

    it('reports already tracked domains without attempting a duplicate insert', async () => {
      DomainMock.findAll.mockResolvedValue([{ get: () => ({ domain: 'example.com' }) }] as any);
      const req = { method: 'POST', body: { domains: ['example.com'] }, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(DomainMock.bulkCreate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'Already tracked: example.com' }) }));
    });

    it('reports a concurrent duplicate insert as a conflict', async () => {
      DomainMock.findAll.mockResolvedValue([]);
      const duplicate = Object.assign(new Error('unique constraint'), { name: 'SequelizeUniqueConstraintError' });
      DomainMock.bulkCreate.mockRejectedValue(duplicate);
      const req = { method: 'POST', body: { domains: ['example.com'] }, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'CONFLICT', message: expect.stringContaining('another request') }) }));
    });

    it('returns 500 when the domain insert fails for a non-duplicate reason', async () => {
      DomainMock.findAll.mockResolvedValue([]);
      DomainMock.bulkCreate.mockRejectedValue(new Error('database unavailable'));
      const req = { method: 'POST', body: { domains: ['example.com'] }, headers: {} } as unknown as NextApiRequest;
      const res = createMockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }) }));
    });
  })
});
