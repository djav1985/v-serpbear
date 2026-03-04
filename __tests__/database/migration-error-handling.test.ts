import { Sequelize } from 'sequelize';

const sqliteDialect = require('../../database/sqlite-dialect');

// Mock the migration logger so tests assert against logger calls, not console.*
jest.mock('../../database/migrationLogger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Migration Error Handling', () => {
  let sequelize: Sequelize;
  const { logger } = require('../../database/migrationLogger') as {
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock }
  };

  beforeEach(() => {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      dialectModule: sqliteDialect,
      storage: ':memory:',
      logging: false,
    });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (sequelize) {
      await sequelize.close();
    }
  });

  test('migration functions gracefully skip when table does not exist', async () => {
    // Test that migration handles missing tables gracefully
    const migration = require('../../database/migrations/1710000000000-add-keyword-state-field');
    
    // Create a mock queryInterface that will fail to describe table
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockRejectedValue(new Error('Table does not exist')),
    };

    // Migration should complete without throwing
    await expect(migration.up({ context: mockQueryInterface })).resolves.not.toThrow();
    
    // Verify skip message was logged via logger.info (not console.log)
    expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Skipping migration - keyword table does not exist yet');
  });

  test('migration down function should also re-throw errors', async () => {
    const migration = require('../../database/migrations/1735640000000-add-database-indexes');
    
    // Create a mock queryInterface that will fail on index removal
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockResolvedValue({ /* table exists */ }),
      removeIndex: jest.fn().mockRejectedValue(new Error('Index removal failed')),
    };

    try {
      await migration.down({ context: mockQueryInterface });
      throw new Error('Expected migration to throw error but it did not');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Index removal failed');
      // Error is now routed through logger.error, not console.error
      expect(logger.error).toHaveBeenCalledWith('Migration rollback error', expect.any(Error));
    }
  });

  test('migration down function gracefully skips when table does not exist', async () => {
    // Test that migration rollback handles missing tables gracefully
    const migration = require('../../database/migrations/1710000000000-add-keyword-state-field');
    
    // Create a mock queryInterface that will fail to describe table
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockRejectedValue(new Error('Table does not exist')),
    };

    // Migration rollback should complete without throwing
    await expect(migration.down({ context: mockQueryInterface })).resolves.not.toThrow();
    
    // Verify skip message was logged via logger.info (not console.log)
    expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Skipping rollback - keyword table does not exist');
  });

  test('successful migrations should not throw errors', async () => {
    const migration = require('../../database/migrations/1710000000000-add-keyword-state-field');
    const { DataTypes } = require('sequelize');
    
    // Create a mock queryInterface that succeeds
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
        constructor: { DataTypes },
      },
      describeTable: jest.fn().mockResolvedValue({
        // Simulate table without the 'state' field
      }),
      addColumn: jest.fn().mockResolvedValue(undefined),
    };

    // This should complete successfully without throwing
    await expect(migration.up({ context: mockQueryInterface }, { DataTypes })).resolves.not.toThrow();
  });
});