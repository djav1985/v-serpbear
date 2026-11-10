import type { NextApiRequest, NextApiResponse } from 'next';

describe('domain route', () => {
  let handler: any;
  let Domain: any;
  let verifyUser: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../../../database/init', () => ({
      __esModule: true,
      ensureDatabase: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../../database/models/domain', () => ({
      __esModule: true,
      default: { findOne: jest.fn() },
    }));
    jest.doMock('../../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
    jest.doMock('../../../utils/domainScraperSettings', () => ({
      __esModule: true,
      maskDomainScraperSettings: jest.fn((s: any) => s),
      parseDomainScraperSettings: jest.fn((s: any) => s),
    }));
    jest.doMock('../../../utils/normalizeDomain', () => ({
      __esModule: true,
      default: jest.fn((d: any) => d),
    }));
    const m1 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domain/route'));
    handler = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../../../database/models/domain');
    Domain = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../../utils/verifyUser');
    verifyUser = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../../__helpers__');
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

});
