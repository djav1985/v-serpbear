/**
 * Common Jest mock configurations used across multiple test files.
 * This file provides reusable mock setups to reduce duplication.
 * 
 * Note: Due to Jest's hoisting behavior, these functions cannot be called directly 
 * in jest.mock() statements. Instead, copy the return value inline into your test file.
 */

/**
 * Mock configuration for the database module.
 * Copy this inline: jest.mock('../../database/database', () => ({ __esModule: true, default: { sync: jest.fn() } }));
 */
export const mockDatabase = () => ({
  __esModule: true,
  default: { sync: jest.fn() },
});

/**
 * Mock configuration for the verifyUser utility.
 * Copy this inline: jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
 */
export const mockVerifyUser = () => ({
  __esModule: true,
  default: jest.fn(),
});

/**
 * Mock configuration for the apiLogging middleware.
 * Copy this inline: jest.mock('../../utils/apiLogging', () => ({ __esModule: true, withApiLogging: (handler: any) => handler }));
 */
export const mockApiLogging = () => ({
  __esModule: true,
  withApiLogging: (handler: any) => handler,
});

/**
 * Mock configuration for the scrapers index.
 * Copy this inline: jest.mock('../../scrapers/index', () => ({ __esModule: true, default: [] }));
 */
export const mockScrapers = () => ({
  __esModule: true,
  default: [],
});

/**
 * Mock configuration for the logger utility.
 * Copy this inline or reference this pattern for your test setup.
 */
export const mockLogger = () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
});

/**
 * Mock configuration for the refresh utility.
 * Copy this inline: jest.mock('../../utils/refresh', () => ({ __esModule: true, default: jest.fn() }));
 */
export const mockRefresh = () => ({
  __esModule: true,
  default: jest.fn(),
});

/**
 * Mock configuration for the Domain model with common methods.
 * Copy this inline or adapt the methods array to match your test needs.
 */
export const mockDomainModel = () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
});

/**
 * Mock configuration for the Keyword model with common methods.
 * Copy this inline or adapt the methods array to match your test needs.
 */
export const mockKeywordModel = () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
});
