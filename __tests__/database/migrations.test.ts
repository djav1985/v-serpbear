/** @jest-environment node */

/* eslint-disable security/detect-non-literal-fs-filename -- ideas-slug and notification-email write only to temp directories created by their tests */

// Mock the migration logger so tests assert against logger calls, not console.*
// (shared by every describe below; the factory is identical in each original file)
jest.mock('../../database/migrationLogger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

export {};

import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';
import { toDomainSlug } from '../../utils/domainSlug';
import { toHistoryDateKey } from '../../utils/historyDateKey';
import historyDateKeyMigration from '../../database/migrations/1773000000000-pad-history-date-keys.js';
import ideasSlugMigration from '../../database/migrations/1715920000000-update-ideas-domain-slug.js';
import notificationEmailMigration from '../../database/migrations/1774000000000-copy-global-notification-email-to-domains.js';
import keywordUniqueMigration from '../../database/migrations/1775000000000-keyword-unique-tracking-target.js';

// Identical in every describe that needs it, so it is shared once at file level
const sqliteDialect = require('../../database/sqlite-dialect');

describe('history-date-keys.migration.test.ts', () => {
  describe('history date key padding', () => {
    const { padHistoryDateKeys } = historyDateKeyMigration as unknown as { padHistoryDateKeys: (history: Record<string, number>) => Record<string, number> };

    it('pads single-digit month and day keys', () => {
      expect(padHistoryDateKeys({ '2026-1-5': 3, '2026-11-12': 4 })).toEqual({ '2026-01-05': 3, '2026-11-12': 4 });
    });

    it('leaves already padded keys unchanged', () => {
      expect(padHistoryDateKeys({ '2026-01-05': 3 })).toEqual({ '2026-01-05': 3 });
    });

    it('keeps the padded entry when both forms of the same day exist', () => {
      expect(padHistoryDateKeys({ '2026-1-5': 9, '2026-01-05': 2 })).toEqual({ '2026-01-05': 2 });
      expect(padHistoryDateKeys({ '2026-01-05': 2, '2026-1-5': 9 })).toEqual({ '2026-01-05': 2 });
    });

    it('gives the same key the app writes for the same calendar day', () => {
      const day = new Date(2026, 0, 5, 12, 0, 0);
      const legacyKey = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;

      expect(padHistoryDateKeys({ [legacyKey]: 7 })).toEqual({ [toHistoryDateKey(day)]: 7 });
    });
  });
});

describe('ideas-slug.migration.test.ts', () => {
  describe('ideas-file slug migration', () => {
    let dir: string;
    let cwdSpy: jest.SpyInstance;

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-ideas-'));
      mkdirSync(path.join(dir, 'data'));
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    });

    it.each(['example.com', 'my-site.com', 'sub.my-site.co.uk'])('writes the same domainSlug as the app for %s', async (domain) => {
      const file = path.join(dir, 'data', `IDEAS_${domain}.json`);
      writeFileSync(file, JSON.stringify({ keywords: [{ uid: 'k1' }], settings: {} }));

      await ideasSlugMigration.up();

      const saved = JSON.parse(readFileSync(file, 'utf-8'));
      expect(saved.settings.domainSlug).toBe(toDomainSlug(domain));
      expect(saved.keywords[0].domain).toBe(toDomainSlug(domain));
    });

    it('does nothing and does not fail when the data folder has no ideas files', async () => {
      writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');

      await expect(ideasSlugMigration.up()).resolves.toBeUndefined();
    });
  });
});

describe('map-pack-migration.test.ts', () => {
  describe('Map Pack Top3 Migration', () => {
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

    test('migration gracefully skips when table does not exist', async () => {
      const migration = require('../../database/migrations/1737307000000-add-keyword-map-pack-flag');

      // Create a mock queryInterface that fails to describe table
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
  });
});

describe('migration-error-handling.test.ts', () => {
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
});

describe('notification-email-copy.migration.test.ts', () => {
  describe('copy global notification email to domains migration', () => {
    type QueryCall = { sql: string, options?: Record<string, any> };

    // A fake query interface that records the SQL it receives and answers the table-existence check
    const makeQueryInterface = (existingTables: string[], rows: unknown[] = []) => {
      const calls: QueryCall[] = [];
      const query = jest.fn(async (sql: string, options?: Record<string, any>) => {
        calls.push({ sql, options });
        if (sql.includes('sqlite_master')) {
          const match = /name='(\w+)'/.exec(sql);
          return [existingTables.filter((table) => table === match?.[1]).map((name) => ({ name }))];
        }
        if (sql.startsWith('SELECT ID, history')) { return rows; }
        return [{ changes: 2 }];
      });
      const queryInterface = {
        sequelize: { query, transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}), constructor: { QueryTypes: { SELECT: 'SELECT' } } },
        describeTable: jest.fn(async () => ({ history: {}, history7d: {} })),
      };
      return { queryInterface, calls };
    };

    let dir: string;
    let cwdSpy: jest.SpyInstance;

    const writeSettings = (settings: Record<string, unknown>) => writeFileSync(path.join(dir, 'data', 'settings.json'), JSON.stringify(settings));
    const updates = (calls: QueryCall[]) => calls.filter((call) => call.sql.startsWith('UPDATE domain'));

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-notify-'));
      mkdirSync(path.join(dir, 'data'));
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    });

    it('copies the trimmed global address onto domains that have none, never overwriting existing ones', async () => {
      writeSettings({ notification_email: ' team@example.com ' });
      const { queryInterface, calls } = makeQueryInterface(['domain']);

      await notificationEmailMigration.up({ context: queryInterface });

      const [update] = updates(calls);
      expect(update.sql).toContain("notification_emails IS NULL OR TRIM(notification_emails) = ''");
      expect(update.options?.replacements).toEqual({ email: 'team@example.com' });
    });

    it('changes nothing without a global address or settings file', async () => {
      const first = makeQueryInterface(['domain']);
      await notificationEmailMigration.up({ context: first.queryInterface });
      expect(updates(first.calls)).toHaveLength(0);

      writeSettings({ notification_email: '   ' });
      const second = makeQueryInterface(['domain']);
      await notificationEmailMigration.up({ context: second.queryInterface });
      expect(updates(second.calls)).toHaveLength(0);
    });

    it('does not fail when the domain table does not exist', async () => {
      writeSettings({ notification_email: 'team@example.com' });
      const { queryInterface, calls } = makeQueryInterface([]);

      await expect(notificationEmailMigration.up({ context: queryInterface })).resolves.toBeUndefined();
      expect(updates(calls)).toHaveLength(0);
    });

    it('history padding migration checks the keyword table through sqlite_master and pads stored rows', async () => {
      const missing = makeQueryInterface([]);
      await expect(historyDateKeyMigration.up({ context: missing.queryInterface })).resolves.toBeUndefined();
      expect(missing.queryInterface.describeTable).not.toHaveBeenCalled();

      const present = makeQueryInterface(['keyword'], [{ ID: 7, history: '{"2026-1-5":3}', history7d: '{}' }]);
      await historyDateKeyMigration.up({ context: present.queryInterface });
      const update = present.calls.find((call) => call.sql.startsWith('UPDATE keyword'));
      expect(JSON.parse(update?.options?.replacements.history)).toEqual({ '2026-01-05': 3 });
      expect(update?.options?.replacements.id).toBe(7);
    });
  });
});

describe('remove-legacy-scraper-overrides.migration.test.ts', () => {
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
});

describe('keyword-country-default.migration.test.ts', () => {
  describe('keyword country default migration', () => {
    // Jest maps better-sqlite3 to a mock, so each scenario runs in a plain Node process with a real SQLite file.
    // The migration rebuilds the keyword table, and this is the only way to check the result for real.
    const ROOT = path.resolve(__dirname, '../..');
    const MIGRATION = path.join(ROOT, 'database/migrations/1772000000000-keyword-country-default-united-states.js');

    const SETUP = `
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { Sequelize } = require(${JSON.stringify(path.join(ROOT, 'node_modules/sequelize'))});
  const sqliteDialect = require(${JSON.stringify(path.join(ROOT, 'database/sqlite-dialect.js'))});
  const mig = require(${JSON.stringify(MIGRATION)});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyword-migration-'));
  const seq = new Sequelize({ dialect: 'sqlite', dialectModule: sqliteDialect, storage: path.join(dir, 'test.sqlite'), logging: false });
  const q = (sql) => seq.query(sql, { type: 'SELECT' });
  const qi = seq.getQueryInterface();
  const columnDefault = async (name) => (await q('PRAGMA table_info(keyword)')).find((c) => c.name === name).dflt_value;
  const run = async () => {
    await seq.query("CREATE TABLE \`keyword\` (\`ID\` INTEGER PRIMARY KEY AUTOINCREMENT, \`keyword\` VARCHAR(255) NOT NULL, \`device\` VARCHAR(255) DEFAULT 'desktop', \`country\` VARCHAR(255) DEFAULT 'US', \`location\` VARCHAR(255) DEFAULT '', \`domain\` VARCHAR(255) NOT NULL DEFAULT '')");
    await seq.query('CREATE INDEX \`keyword_domain_idx\` ON \`keyword\` (\`domain\`)');
    await seq.query("INSERT INTO keyword (keyword, domain, country, location) VALUES ('alpha', 'a.com', 'US', 'US')");
    await seq.query("INSERT INTO keyword (keyword, domain, country, location) VALUES ('beta', 'a.com', 'US', 'Austin,TX,US')");
    await seq.query("INSERT INTO keyword (keyword, domain, country, location) VALUES ('gamma', 'b.com', 'GB', 'London,England,GB')");
    await seq.query("DELETE FROM keyword WHERE keyword = 'gamma'");
  };
`;

    const runScenario = (body: string): unknown => {
      const script = `
    ${SETUP}
    (async () => {
      try {
        ${body}
        console.log('RESULT' + JSON.stringify(result));
      } finally {
        await seq.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
      const output = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      const line = output.split('\n').find((text) => text.startsWith('RESULT'));
      if (!line) { throw new Error(`No result from scenario:\n${output}`); }
      return JSON.parse(line.slice('RESULT'.length));
    };

    it('makes United States the country default and changes US locations to United States', () => {
      const result = runScenario(`
        await run();
        await mig.up({ context: qi });
        result = {
          countryDefault: await columnDefault('country'),
          locationDefault: await columnDefault('location'),
          rows: await q('SELECT keyword, location, country FROM keyword ORDER BY ID'),
        };
      `);

      expect(result).toEqual({
        countryDefault: "'United States'",
        locationDefault: "''",
        rows: [
          { keyword: 'alpha', location: 'United States', country: 'US' },
          { keyword: 'beta', location: 'Austin,TX,United States', country: 'US' },
        ],
      });
    });

    it('keeps the ID counter so deleted IDs are not reused', () => {
      const result = runScenario(`
        await run();
        await mig.up({ context: qi });
        await seq.query("INSERT INTO keyword (keyword, domain) VALUES ('delta', 'a.com')");
        result = await q("SELECT ID FROM keyword WHERE keyword = 'delta'");
      `);

      expect(result).toEqual([{ ID: 4 }]);
    });

    it('gives a new row without a country the new default', () => {
      const result = runScenario(`
        await run();
        await mig.up({ context: qi });
        await seq.query("INSERT INTO keyword (keyword, domain) VALUES ('delta', 'a.com')");
        result = await q("SELECT country, location FROM keyword WHERE keyword = 'delta'");
      `);

      expect(result).toEqual([{ country: 'United States', location: '' }]);
    });

    it('keeps the existing indexes', () => {
      const result = runScenario(`
        await run();
        await mig.up({ context: qi });
        result = await q("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='keyword'");
      `);

      expect(result).toEqual(expect.arrayContaining([{ name: 'keyword_domain_idx' }]));
    });

    it('restores the US default when reverted and keeps the rows', () => {
      const result = runScenario(`
        await run();
        await mig.up({ context: qi });
        await mig.down({ context: qi });
        result = { countryDefault: await columnDefault('country'), count: await q('SELECT COUNT(*) AS c FROM keyword') };
      `);

      expect(result).toEqual({ countryDefault: "'US'", count: [{ c: 2 }] });
    });

    it('does nothing when the keyword table does not exist yet', () => {
      const result = runScenario(`
        await seq.query('SELECT 1');
        await mig.up({ context: qi });
        result = await q("SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'");
      `);

      expect(result).toEqual([]);
    });
  });
});

describe('location-normalize.migration.test.ts', () => {
  describe('keyword location normalization migration', () => {
    // The migration is plain JS and is run by sequelize-cli, so its transform is checked directly here
    const { normalizeLocation } = require('../../database/migrations/1770200000000-normalize-keyword-location-country.js');

    it('writes a trailing country code as the full name', () => {
      expect(normalizeLocation('Port Charlotte,Florida,US', 'US')).toBe('Port Charlotte,Florida,United States');
    });

    it('keeps commas inside the city name', () => {
      expect(normalizeLocation('Washington,D.C.,District of Columbia,US', 'US'))
        .toBe('Washington,D.C.,District of Columbia,United States');
    });

    it('keeps a city with commas when the country is already a name', () => {
      expect(normalizeLocation('Washington,D.C.,District of Columbia,United States', 'US'))
        .toBe('Washington,D.C.,District of Columbia,United States');
    });

    it('clears country-only values', () => {
      expect(normalizeLocation('US', 'US')).toBe('');
      expect(normalizeLocation('UNITED STATES', 'US')).toBe('');
      expect(normalizeLocation('', 'US')).toBe('');
    });

    it('returns blank when only a city is left', () => {
      expect(normalizeLocation('Miami,US', 'US')).toBe('');
    });

    it('canonicalizes a country name typed in any case', () => {
      expect(normalizeLocation('Port Charlotte,Florida,UNITED STATES', 'US')).toBe('Port Charlotte,Florida,United States');
    });
  });
});

describe('keyword-unique-target.migration.test.ts', () => {
  describe('keyword unique target migration', () => {
    const { planDuplicateRemovals } = keywordUniqueMigration as unknown as { planDuplicateRemovals: (rows: Record<string, unknown>[]) => any[] };

    const row = (overrides: Record<string, unknown>) => ({
      ID: 1, domain: 'example.com', keyword: 'alpha', country: 'US', location: '', device: 'desktop', history: '{}', tags: '[]', sticky: 0, ...overrides,
    });

    it('plans nothing when every target is unique, including the same keyword in another city or device', () => {
      expect(planDuplicateRemovals([
        row({ ID: 1 }),
        row({ ID: 2, location: 'Austin,Texas,United States' }),
        row({ ID: 3, device: 'mobile' }),
        row({ ID: 4, domain: 'other.com' }),
      ])).toEqual([]);
    });

    it('keeps the row with the most history and merges tags and the star', () => {
      const [plan] = planDuplicateRemovals([
        row({ ID: 1, history: '{"2026-01-01":3}', tags: '["a"]' }),
        row({ ID: 2, history: '{"2026-01-01":3,"2026-01-02":2}', tags: '["B","a"]' }),
        row({ ID: 3, sticky: 1, tags: '["c"]' }),
      ]);

      expect(plan.keepID).toBe(2);
      expect(plan.deleteIDs.sort()).toEqual([1, 3]);
      expect(plan.tags).toEqual(['B', 'a', 'c']);
      expect(plan.sticky).toBe(true);
      expect(plan.tagsChanged).toBe(true);
      expect(plan.stickyChanged).toBe(true);
    });

    it('keeps the lowest ID when history sizes tie, and treats a null and an empty location as the same target', () => {
      const [plan] = planDuplicateRemovals([row({ ID: 9, location: null }), row({ ID: 4, location: '' })]);

      expect(plan.keepID).toBe(4);
      expect(plan.deleteIDs).toEqual([9]);
      expect(plan.tagsChanged).toBe(false);
    });

    it('ignores unreadable history and tags instead of failing', () => {
      const [plan] = planDuplicateRemovals([row({ ID: 1, history: 'oops', tags: 'oops' }), row({ ID: 2, history: null, tags: null })]);

      expect(plan.keepID).toBe(1);
      expect(plan.tags).toEqual([]);
    });

    it('runs the plan: merges rows, then creates the unique index, and skips when the table is missing', async () => {
      const calls: Array<{ sql: string, options?: any }> = [];
      const make = (tables: string[], rows: unknown[]) => ({
        sequelize: {
          constructor: { QueryTypes: { SELECT: 'SELECT' } },
          transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
          query: jest.fn(async (sql: string, options?: any) => {
            calls.push({ sql, options });
            if (sql.includes('sqlite_master')) { return [tables.map((name) => ({ name }))]; }
            if (sql.startsWith('SELECT ID')) { return rows; }
            return [{}];
          }),
        },
      });

      await keywordUniqueMigration.up({ context: make([], []) });
      expect(calls.some((call) => call.sql.includes('CREATE UNIQUE INDEX'))).toBe(false);

      calls.length = 0;
      await keywordUniqueMigration.up({ context: make(['keyword'], [row({ ID: 1 }), row({ ID: 2 })]) });
      expect(calls.find((call) => call.sql.startsWith('DELETE FROM keyword'))?.options.replacements).toEqual({ id: 2 });
      const createIndex = calls.find((call) => call.sql.includes('CREATE UNIQUE INDEX'));
      expect(createIndex?.sql).toContain("COALESCE(location, '')");
      expect(calls.findIndex((call) => call.sql.startsWith('DELETE'))).toBeLessThan(calls.findIndex((call) => call.sql.includes('CREATE UNIQUE INDEX')));
    });
  });
});
