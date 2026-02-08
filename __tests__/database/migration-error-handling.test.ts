import { Sequelize } from 'sequelize';

const sqliteDialect = require('../../database/sqlite-dialect');

describe('Migration Error Handling', () => {
  let sequelize: Sequelize;
  
  beforeEach(() => {
    sequelize = new Sequelize({
      dialect: 'sqlite',
      dialectModule: sqliteDialect,
      storage: ':memory:',
      logging: false,
    });
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

    // Mock console.log to capture skip message
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Migration should complete without throwing
    await expect(migration.up({ context: mockQueryInterface })).resolves.not.toThrow();
    
    // Verify skip message was logged
    expect(consoleSpy).toHaveBeenCalledWith('[MIGRATION] Skipping migration - keyword table does not exist yet');
    
    consoleSpy.mockRestore();
  });

  test('migration down function should also re-throw errors', async () => {
    const migration = require('../../database/migrations/1735640000000-add-database-indexes');
    
    // Create a mock queryInterface that will fail
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      removeIndex: jest.fn().mockRejectedValue(new Error('Index removal failed')),
    };

    // Mock console.error to capture error logging
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      await migration.down({ context: mockQueryInterface });
      throw new Error('Expected migration to throw error but it did not');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Index removal failed');
      expect(consoleSpy).toHaveBeenCalledWith('Migration rollback error:', expect.any(Error));
    } finally {
      consoleSpy.mockRestore();
    }
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