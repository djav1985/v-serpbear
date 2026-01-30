/**
 * Common Jest mock configurations used across multiple test files.
 * This file provides reusable mock setups to reduce duplication.
 */

/**
 * Mock configuration for the database module.
 * Usage: In test file, add: jest.mock('../../database/database', mockDatabase);
 */
export const mockDatabase = () => ({
  __esModule: true,
  default: { sync: jest.fn() },
});

/**
 * Mock configuration for the verifyUser utility.
 * Usage: In test file, add: jest.mock('../../utils/verifyUser', mockVerifyUser);
 */
export const mockVerifyUser = () => ({
  __esModule: true,
  default: jest.fn(),
});

/**
 * Mock configuration for the apiLogging middleware.
 * Usage: In test file, add: jest.mock('../../utils/apiLogging', mockApiLogging);
 */
export const mockApiLogging = () => ({
  __esModule: true,
  withApiLogging: (handler: any) => handler,
});

/**
 * Mock configuration for the scrapers index.
 * Usage: In test file, add: jest.mock('../../scrapers/index', mockScrapers);
 */
export const mockScrapers = () => ({
  __esModule: true,
  default: [],
});

/**
 * Mock configuration for the logger utility.
 * Usage: In test file, add: jest.mock('../../utils/logger', mockLogger);
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
 * Usage: In test file, add: jest.mock('../../utils/refresh', mockRefresh);
 */
export const mockRefresh = () => ({
  __esModule: true,
  default: jest.fn(),
});

/**
 * Mock configuration for the Domain model with common methods.
 * Usage: In test file, add: jest.mock('../../database/models/domain', mockDomainModel);
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
 * Usage: In test file, add: jest.mock('../../database/models/keyword', mockKeywordModel);
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
