/** @jest-environment node */

import { Sequelize } from 'sequelize';

const sqliteDialect = require('../../database/sqlite-dialect');

describe('Map Pack Top3 Migration', () => {
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

  test('migration adds mapPackTop3 column with proper constraints', async () => {
    const migration = require('../../database/migrations/1737307000000-add-keyword-map-pack-flag');
    const { DataTypes } = require('sequelize');
    
    // Create a mock queryInterface that succeeds
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
        constructor: { DataTypes },
        query: jest.fn().mockResolvedValue(undefined),
      },
      describeTable: jest.fn().mockResolvedValue({
        // Simulate table without the 'mapPackTop3' field initially
      }),
      addColumn: jest.fn().mockResolvedValue(undefined),
      changeColumn: jest.fn().mockResolvedValue(undefined),
    };

    // This should complete successfully
    await expect(migration.up({ context: mockQueryInterface }, { DataTypes })).resolves.not.toThrow();
    
    // Verify the column is added as nullable first
    expect(mockQueryInterface.addColumn).toHaveBeenCalledWith(
      'keyword',
      'mapPackTop3',
      {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      { transaction: { transaction: 'mock' } }
    );

    // Verify backfill UPDATE query is executed
    expect(mockQueryInterface.sequelize.query).toHaveBeenCalledWith(
      'UPDATE keyword SET mapPackTop3 = 0 WHERE mapPackTop3 IS NULL',
      { transaction: { transaction: 'mock' } }
    );

    // Verify column is changed to NOT NULL after backfill
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'mapPackTop3',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction: { transaction: 'mock' } }
    );
  });

  test('migration is idempotent - does not run UPDATE when column exists', async () => {
    const migration = require('../../database/migrations/1737307000000-add-keyword-map-pack-flag');
    const { DataTypes } = require('sequelize');
    
    // Create a mock queryInterface where column already exists
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
        constructor: { DataTypes },
        query: jest.fn().mockResolvedValue(undefined),
      },
      describeTable: jest.fn().mockResolvedValue({
        // Simulate table WITH the 'mapPackTop3' field already present
        mapPackTop3: { type: 'BOOLEAN', allowNull: false, defaultValue: false }
      }),
      addColumn: jest.fn().mockResolvedValue(undefined),
      changeColumn: jest.fn().mockResolvedValue(undefined),
    };

    // This should complete successfully without adding column
    await expect(migration.up({ context: mockQueryInterface }, { DataTypes })).resolves.not.toThrow();
    
    // Verify no operations are performed when column already exists
    expect(mockQueryInterface.addColumn).not.toHaveBeenCalled();
    expect(mockQueryInterface.sequelize.query).not.toHaveBeenCalled();
    expect(mockQueryInterface.changeColumn).not.toHaveBeenCalled();
  });

  test('migration down removes mapPackTop3 column correctly', async () => {
    const migration = require('../../database/migrations/1737307000000-add-keyword-map-pack-flag');
    
    // Create a mock queryInterface for rollback
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockResolvedValue({
        mapPackTop3: { type: 'BOOLEAN', allowNull: false, defaultValue: false }
      }),
      removeColumn: jest.fn().mockResolvedValue(undefined),
    };

    // This should complete successfully
    await expect(migration.down({ context: mockQueryInterface })).resolves.not.toThrow();
    
    // Verify column is removed
    expect(mockQueryInterface.removeColumn).toHaveBeenCalledWith('keyword', 'mapPackTop3', {
      transaction: { transaction: 'mock' },
    });
  });

  test('migration handles errors and re-throws them', async () => {
    const migration = require('../../database/migrations/1737307000000-add-keyword-map-pack-flag');
    
    // Create a mock queryInterface that will fail
    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
      },
      describeTable: jest.fn().mockRejectedValue(new Error('Database error')),
    };

    // Mock console.error to capture error logging
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      await migration.up({ context: mockQueryInterface });
      throw new Error('Expected migration to throw error but it did not');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Database error');
      expect(consoleSpy).toHaveBeenCalledWith('error :', expect.any(Error));
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
