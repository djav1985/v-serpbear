import { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../../__helpers__/routeAdapter';
import * as handlerRoute from '../../../app/api/google/searchconsole/route';
import * as insightHandlerRoute from '../../../app/api/google/insight/route';
import { fetchDomainSCData, getSearchConsoleApiInfo, readLocalSCData } from '../../../utils/searchConsole';
import Domain from '../../../database/models/domain';
import verifyUser from '../../../utils/verifyUser';
const handler = asHandler(handlerRoute);
const insightHandler = asHandler(insightHandlerRoute);
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
        mockGetSearchConsoleApiInfo.mockReset();
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
        mockGetSearchConsoleApiInfo.mockReset();
        mockFetchDomainSCData.mockReset();
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'client', private_key: 'key' } as any);
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

      it('reuses a fresh cached result even when all Search Console windows are empty', async () => {
        const cachedData = {
          threeDays: [], sevenDays: [], thirtyDays: [], stats: [],
          lastFetched: new Date().toISOString(), lastFetchError: '',
        };
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com' }) } as any);
        mockReadLocalSCData.mockResolvedValue(cachedData as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: cachedData });
      });

      it('fetches stale Search Console data using the domain credentials', async () => {
        const domain = { domain: 'my-site.com', search_console: '{"client_email":"site@example.com"}' };
        const fetchedData = { threeDays: [], sevenDays: [], thirtyDays: [{ keyword: 'coffee' }], stats: [], lastFetched: new Date().toISOString() };
        mockDomainFindOne.mockResolvedValue({ get: () => domain } as any);
        mockReadLocalSCData.mockResolvedValue({ threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '2020-01-01T00:00:00.000Z' } as any);
        mockGetSearchConsoleApiInfo
          .mockResolvedValueOnce({ client_email: 'site@example.com', private_key: 'site-key' } as any)
          .mockResolvedValueOnce({ client_email: '', private_key: '' } as any);
        mockFetchDomainSCData.mockResolvedValue(fetchedData as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockFetchDomainSCData).toHaveBeenCalledWith(domain, { client_email: 'site@example.com', private_key: 'site-key' }, { client_email: '', private_key: '' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: fetchedData });
      });

      it('uses global credentials when local Search Console credentials are absent', async () => {
        const domain = { domain: 'my-site.com' };
        const fetchedData = { threeDays: [], sevenDays: [], thirtyDays: [{ keyword: 'coffee' }], stats: [] };
        mockDomainFindOne.mockResolvedValue({ get: () => domain } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'global@example.com', private_key: 'global-key' } as any);
        mockFetchDomainSCData.mockResolvedValue(fetchedData as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockGetSearchConsoleApiInfo).toHaveBeenCalledWith({});
        expect(mockFetchDomainSCData).toHaveBeenCalledWith(domain, { client_email: '', private_key: '' }, { client_email: 'global@example.com', private_key: 'global-key' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: fetchedData });
      });

      it('keeps the route successful when Search Console is not integrated', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com' }) } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: '', private_key: '' } as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Google Search Console is not Integrated.' });
      });

      it('returns a gateway error when a successful Search Console request has no 30-day rows', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com', search_console: '{}' }) } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'client', private_key: 'key' } as any);
        mockFetchDomainSCData.mockResolvedValue({ threeDays: [], sevenDays: [], thirtyDays: [], stats: [] } as any);

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_GATEWAY' }) }));
      });

      it('maps a Search Console fetch exception to a gateway error', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com', search_console: '{}' }) } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: 'client', private_key: 'key' } as any);
        mockFetchDomainSCData.mockRejectedValue(new Error('Google unavailable'));

        await handler(req as NextApiRequest, res as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_GATEWAY' }) }));
      });

      it('rejects invalid domains in both GET routes before querying', async () => {
        const invalidDomainRequests = [
          { route: handler, domain: '../../etc/passwd' },
          { route: insightHandler, domain: 'bad/domain' },
        ];

        await Promise.all(invalidDomainRequests.map(async ({ route, domain }) => {
          const invalidReq = {
            method: 'GET',
            query: { domain },
            headers: { authorization: 'Bearer test-api-key' },
          } as unknown as NextApiRequest;
          const invalidRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

          await route(invalidReq, invalidRes);

          expect(invalidRes.status).toHaveBeenCalledWith(400);
          expect(invalidRes.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'Domain is Missing.' }) }),
          );
        }));

        expect(mockDomainFindOne).not.toHaveBeenCalled();
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
        mockGetSearchConsoleApiInfo.mockReset();
        mockFetchDomainSCData.mockReset();
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

      it('serves a recent local insight snapshot without contacting Google', async () => {
        const cachedData = {
          threeDays: [{ keyword: 'coffee', uid: 'us:desktop:coffee', device: 'desktop', country: 'US', clicks: 4, impressions: 20, ctr: 20, position: 2, page: '/coffee' }],
          sevenDays: [],
          thirtyDays: [],
          lastFetched: new Date().toISOString(),
          stats: [{ date: '2026-11-10', clicks: 4 }],
        };
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com' }) } as any);
        mockReadLocalSCData.mockResolvedValue(cachedData as any);

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockGetSearchConsoleApiInfo).not.toHaveBeenCalled();
        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ stats: cachedData.stats, keywords: expect.any(Array), pages: expect.any(Array), countries: expect.any(Array) }) });
      });

      it('uses global Search Console credentials when the local snapshot is stale and the domain has no credentials', async () => {
        const domain = { domain: 'my-site.com' };
        const freshData = {
          threeDays: [], sevenDays: [],
          thirtyDays: [{ keyword: 'coffee', uid: 'us:desktop:coffee', device: 'desktop', country: 'US', clicks: 4, impressions: 20, ctr: 20, position: 2, page: '/coffee' }],
          lastFetched: new Date().toISOString(), stats: [],
        };
        mockDomainFindOne.mockResolvedValue({ get: () => domain } as any);
        mockReadLocalSCData.mockResolvedValue({ threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '2020-01-01T00:00:00.000Z' } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValueOnce({ client_email: 'global@example.com', private_key: 'global-key' } as any);
        mockFetchDomainSCData.mockResolvedValue(freshData as any);

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockGetSearchConsoleApiInfo).toHaveBeenCalledTimes(1);
        expect(mockGetSearchConsoleApiInfo).toHaveBeenCalledWith({});
        expect(mockFetchDomainSCData).toHaveBeenCalledWith(domain, { client_email: '', private_key: '' }, { client_email: 'global@example.com', private_key: 'global-key' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ stats: [], keywords: expect.any(Array) }) });
      });

      it('returns a normal not-integrated response when neither domain nor global credentials are configured', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com' }) } as any);
        mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: '', private_key: '' } as any);

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockFetchDomainSCData).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ data: null, error: 'Google Search Console is not Integrated.' });
      });

      it('reports an upstream failure when Google returns no 30-day insight rows', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com', search_console: '{}' }) } as any);
        mockFetchDomainSCData.mockResolvedValue({ threeDays: [], sevenDays: [], thirtyDays: [], stats: [] } as any);

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(mockFetchDomainSCData).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_GATEWAY' }) }));
      });

      it('returns an internal error when the insight fetch rejects', async () => {
        mockDomainFindOne.mockResolvedValue({ get: () => ({ domain: 'my-site.com', search_console: '{}' }) } as any);
        mockFetchDomainSCData.mockRejectedValue(new Error('Google unavailable'));

        await insightHandler(req as NextApiRequest, res as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }) }));
      });

    });

  });
