/**
 * Tests for fetchSearchConsoleData error logging.
 * These tests mock the googleapis client to throw and assert that
 * logger.error is called with the correct label suffix for each type.
 *
 * A separate file is needed because the main searchConsole.test.ts replaces
 * fetchDomainSCData with a jest.fn() at module scope, whereas these tests
 * require the real fetchDomainSCData implementation to run.
 */

import { logger } from '../../utils/logger';
import { fetchDomainSCData } from '../../utils/searchConsole';

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
}));

// Prevent real file I/O inside readLocalSCData / updateLocalSCData
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('file not found')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({})),
}));

const mockQuery = jest.fn();
jest.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: jest.fn().mockImplementation(() => ({
      searchanalytics: { query: mockQuery },
    })),
  },
}));

const mockDomain = {
  domain: 'example.com',
  search_console: JSON.stringify({ property_type: 'domain', url: '' }),
} as any;

const mockApi = { client_email: 'test@example.com', private_key: 'test-key' };

describe('fetchSearchConsoleData error logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reject every API call to trigger the catch branch in fetchSearchConsoleData
    mockQuery.mockRejectedValue(new Error('simulated API error'));
  });

  it('logs with (stats) suffix when the stat fetch fails', async () => {
    await fetchDomainSCData(mockDomain, mockApi);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    expect(errorMessages.some((m) => m.includes('(stats)'))).toBe(true);
  });

  it('logs with (<days>days) suffix when a non-stat fetch fails', async () => {
    await fetchDomainSCData(mockDomain, mockApi);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    expect(errorMessages.some((m) => /\(\d+days\)/.test(m))).toBe(true);
  });

  it('never logs (stats) suffix for non-stat fetches', async () => {
    await fetchDomainSCData(mockDomain, mockApi);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    // Every days-type call must use the <N>days pattern, not (stats)
    const daysCalls = errorMessages.filter((m) => /\(\d+days\)/.test(m));
    daysCalls.forEach((m) => {
      expect(m).not.toContain('(stats)');
    });
  });
});
