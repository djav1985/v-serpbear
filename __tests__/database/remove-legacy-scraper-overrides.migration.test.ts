/** @jest-environment node */

export {};

jest.mock('../../database/migrationLogger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('remove legacy scraper overrides migration', () => {
  const migration = require('../../database/migrations/1771000000000-remove-legacy-scraper-overrides');
  const { logger } = require('../../database/migrationLogger') as {
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears removed per-domain scraper overrides and preserves active ones', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([[
        { ID: 1, scraper_settings: JSON.stringify({ scraper_type: 'scrapingant', scraping_api: 'abc' }) },
        { ID: 2, scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'keep' }) },
        { ID: 3, scraper_settings: JSON.stringify({ scraper_type: 'proxy', scraping_api: 'legacy' }) },
      ]])
      .mockResolvedValue(undefined);

    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
        query,
      },
      describeTable: jest.fn().mockResolvedValue({ scraper_settings: { type: 'TEXT' } }),
    };

    await expect(migration.up({ context: mockQueryInterface })).resolves.not.toThrow();

    expect(query).toHaveBeenCalledWith(
      'SELECT ID, scraper_settings FROM domain WHERE scraper_settings IS NOT NULL',
      { transaction: { transaction: 'mock' } },
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE domain SET scraper_settings = NULL WHERE ID = :id',
      { replacements: { id: 1 }, transaction: { transaction: 'mock' } },
    );
    expect(query).toHaveBeenCalledWith(
      'UPDATE domain SET scraper_settings = NULL WHERE ID = :id',
      { replacements: { id: 3 }, transaction: { transaction: 'mock' } },
    );
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('is idempotent when no removed overrides remain', async () => {
    const query = jest.fn().mockResolvedValueOnce([[
      { ID: 2, scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'keep' }) },
      { ID: 4, scraper_settings: null },
    ]]);

    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
        query,
      },
      describeTable: jest.fn().mockResolvedValue({ scraper_settings: { type: 'TEXT' } }),
    };

    await expect(migration.up({ context: mockQueryInterface })).resolves.not.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('skips gracefully when the domain table does not exist', async () => {
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockRejectedValue(new Error('Table does not exist')),
    };

    await expect(migration.up({ context: mockQueryInterface })).resolves.not.toThrow();
    expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Skipping remove-legacy-scraper-overrides - domain table does not exist yet');
  });
});
