import { Sequelize } from 'sequelize';

const sqliteDialect = require('../../app/database/sqlite-dialect');

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

  test('migration functions should re-throw errors after logging', async () => {
    // Test that migration error handling works correctly by importing and testing a migration
    const migration = require('../../app/database/migrations/1710000000000-add-keyword-state-field');
    
    // Create a mock queryInterface that will fail
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockRejectedValue(new Error('Test database error')),
    };

    // Mock console.log to capture error logging
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    try {
      // This should throw an error after logging it
      await migration.up({ context: mockQueryInterface });
      throw new Error('Expected migration to throw error but it did not');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test database error');
      expect(consoleSpy).toHaveBeenCalledWith('error :', expect.any(Error));
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test('migration down function should also re-throw errors', async () => {
    const migration = require('../../app/database/migrations/1735640000000-add-database-indexes');
    
    // Create a mock queryInterface that will fail
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      removeIndex: jest.fn().mockRejectedValue(new Error('Index removal failed')),
    };

    // Mock console.log to capture error logging
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
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
    const migration = require('../../app/database/migrations/1710000000000-add-keyword-state-field');
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