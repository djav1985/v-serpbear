/** @jest-environment node */

describe('Keyword schema optimization migration', () => {
  test('migration updates structured columns, indexes, and foreign key constraints', async () => {
    const migration = require('../../database/migrations/1739000000000-optimize-keyword-schema');
    const { DataTypes } = require('sequelize');

    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
        constructor: { DataTypes },
      },
      describeTable: jest.fn().mockResolvedValue({
        history: { type: 'STRING' },
        url: { type: 'STRING' },
        tags: { type: 'STRING' },
        lastResult: { type: 'STRING' },
        localResults: { type: 'STRING' },
        domain: { type: 'STRING' },
      }),
      changeColumn: jest.fn().mockResolvedValue(undefined),
      showIndex: jest.fn().mockResolvedValue([]),
      addIndex: jest.fn().mockResolvedValue(undefined),
      addConstraint: jest.fn().mockResolvedValue(undefined),
    };

    await expect(migration.up({ context: mockQueryInterface }, { DataTypes })).resolves.not.toThrow();

    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'history',
      expect.objectContaining({ type: DataTypes.TEXT }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'url',
      expect.objectContaining({ type: DataTypes.TEXT }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'tags',
      expect.objectContaining({ type: DataTypes.TEXT }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'lastResult',
      expect.objectContaining({ type: DataTypes.TEXT }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'localResults',
      expect.objectContaining({ type: DataTypes.TEXT }),
      { transaction: { transaction: 'mock' } }
    );

    expect(mockQueryInterface.addIndex).toHaveBeenCalledWith('keyword', ['domain'], {
      name: 'keyword_domain_idx',
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.addIndex).toHaveBeenCalledWith('keyword', ['keyword'], {
      name: 'keyword_keyword_idx',
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.addIndex).toHaveBeenCalledWith('keyword', ['device'], {
      name: 'keyword_device_idx',
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.addIndex).toHaveBeenCalledWith('keyword', ['country'], {
      name: 'keyword_country_idx',
      transaction: { transaction: 'mock' },
    });

    expect(mockQueryInterface.addConstraint).toHaveBeenCalledWith(
      'keyword',
      expect.objectContaining({
        name: 'keyword_domain_fk',
        type: 'foreign key',
        fields: ['domain'],
        references: { table: 'domain', field: 'domain' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      })
    );
  });

  test('migration down reverts keyword schema updates', async () => {
    const migration = require('../../database/migrations/1739000000000-optimize-keyword-schema');
    const { DataTypes } = require('sequelize');

    const mockQueryInterface = {
      sequelize: {
        transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
        constructor: { DataTypes },
      },
      describeTable: jest.fn().mockResolvedValue({
        history: { type: 'TEXT' },
        url: { type: 'TEXT' },
        tags: { type: 'TEXT' },
        lastResult: { type: 'TEXT' },
        localResults: { type: 'TEXT' },
      }),
      changeColumn: jest.fn().mockResolvedValue(undefined),
      removeConstraint: jest.fn().mockResolvedValue(undefined),
      removeIndex: jest.fn().mockResolvedValue(undefined),
    };

    await expect(migration.down({ context: mockQueryInterface }, { DataTypes })).resolves.not.toThrow();

    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'history',
      expect.objectContaining({ type: DataTypes.STRING }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'url',
      expect.objectContaining({ type: DataTypes.STRING }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'tags',
      expect.objectContaining({ type: DataTypes.STRING }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'lastResult',
      expect.objectContaining({ type: DataTypes.STRING }),
      { transaction: { transaction: 'mock' } }
    );
    expect(mockQueryInterface.changeColumn).toHaveBeenCalledWith(
      'keyword',
      'localResults',
      expect.objectContaining({ type: DataTypes.STRING }),
      { transaction: { transaction: 'mock' } }
    );

    expect(mockQueryInterface.removeConstraint).toHaveBeenCalledWith('keyword', 'keyword_domain_fk', {
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.removeIndex).toHaveBeenCalledWith('keyword', 'keyword_keyword_idx', {
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.removeIndex).toHaveBeenCalledWith('keyword', 'keyword_domain_idx', {
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.removeIndex).toHaveBeenCalledWith('keyword', 'keyword_device_idx', {
      transaction: { transaction: 'mock' },
    });
    expect(mockQueryInterface.removeIndex).toHaveBeenCalledWith('keyword', 'keyword_country_idx', {
      transaction: { transaction: 'mock' },
    });
  });
});
