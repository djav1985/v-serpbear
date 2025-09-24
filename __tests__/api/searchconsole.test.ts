/**
 * Test for search console API endpoint - specifically testing the cron functionality
 * that fetches search console data for all domains.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../app/pages/api/searchconsole';
import { fetchDomainSCData, getSearchConsoleApiInfo } from '../../app/utils/searchConsole';
import Domain from '../../app/database/models/domain';
import verifyUser from '../../app/utils/verifyUser';

// Mock the dependencies
jest.mock('../../app/utils/searchConsole');
jest.mock('../../app/database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../app/database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../app/utils/verifyUser');

const mockFetchDomainSCData = fetchDomainSCData as jest.MockedFunction<typeof fetchDomainSCData>;
const mockGetSearchConsoleApiInfo = getSearchConsoleApiInfo as jest.MockedFunction<typeof getSearchConsoleApiInfo>;
const mockDomainFindAll = Domain.findAll as jest.MockedFunction<typeof Domain.findAll>;

// Common mock data structures
const mockSCDataResponse = {
  threeDays: [],
  sevenDays: [],
  thirtyDays: [],
  lastFetched: new Date().toISOString(),
  lastFetchError: '',
  stats: [],
};

describe('/api/searchconsole - CRON functionality', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;

  beforeEach(() => {
    req = {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-api-key',
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    // Reset all mocks
    jest.clearAllMocks();
    (verifyUser as jest.Mock).mockReturnValue('authorized');
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
