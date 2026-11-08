/** @jest-environment node */

import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Sequelize } from 'sequelize';
import { toDomainSlug } from '../../utils/domainSlug';
import { toHistoryDateKey } from '../../utils/historyDateKey';
import historyDateKeyMigration from '../../database/migrations/1773000000000-pad-history-date-keys.js';
import skippedLastResultMigration from '../../database/migrations/1790000000001-strip-skipped-lastresult-entries.js';
import ideasSlugMigration from '../../database/migrations/1715920000000-update-ideas-domain-slug.js';
import notificationEmailMigration from '../../database/migrations/1774000000000-copy-global-notification-email-to-domains.js';
import keywordUniqueMigration from '../../database/migrations/1775000000000-keyword-unique-tracking-target.js';
import staleUpdatingFlagsMigration from '../../database/migrations/1776000000000-reset-stale-updating-flags.js';
import dropDomainNotificationIntervalMigration from '../../database/migrations/1777000000000-drop-domain-notification-interval.js';
import dropDomainTagsMigration from '../../database/migrations/1790000000002-drop-domain-tags-column.js';
import { backupDatabaseFile } from '../../database/backupDatabase';
import migration from '../../database/migrations/1779000000000-replace-smart-scrape-strategy.js';
import dropMigration from '../../database/migrations/1781000000000-drop-removed-settings-keys.js';

jest.mock('../../database/migrationLogger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('migrations', () => {
  /* eslint-disable security/detect-non-literal-fs-filename -- ideas-slug and notification-email write only to temp directories created by their tests */

  // Mock the migration logger so tests assert against logger calls, not console.*
  // (shared by every describe below; the factory is identical in each original file)


  // Identical in every describe that needs it, so it is shared once at file level
  const sqliteDialect = require('../../database/sqlite-dialect');

  describe('history-date-keys.migration.test.ts', () => {
    describe('history date key padding', () => {
      const { padHistoryDateKeys } = historyDateKeyMigration as unknown as { padHistoryDateKeys: (history: Record<string, number>) => Record<string, number> };

      it('pads single-digit month and day keys and leaves already padded keys unchanged', () => {
        expect(padHistoryDateKeys({ '2026-1-5': 3, '2026-11-12': 4 })).toEqual({ '2026-01-05': 3, '2026-11-12': 4 });
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

      it('writes the same domainSlug as the app for each domain', async () => {
        for (const domain of ['example.com', 'my-site.com', 'sub.my-site.co.uk']) {
          const file = path.join(dir, 'data', `IDEAS_${domain}.json`);
          writeFileSync(file, JSON.stringify({ keywords: [{ uid: 'k1' }], settings: {} }));

          await ideasSlugMigration.up();

          const saved = JSON.parse(readFileSync(file, 'utf-8'));
          expect(saved.settings.domainSlug).toBe(toDomainSlug(domain));
          expect(saved.keywords[0].domain).toBe(toDomainSlug(domain));
        }
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

        // Rollback removes the column again
        const rollbackInterface = {
          sequelize: {
            transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
          },
          describeTable: jest.fn().mockResolvedValue({
            mapPackTop3: { type: 'BOOLEAN', allowNull: false, defaultValue: false }
          }),
          removeColumn: jest.fn().mockResolvedValue(undefined),
        };
        await expect(migration.down({ context: rollbackInterface })).resolves.not.toThrow();
        expect(rollbackInterface.removeColumn).toHaveBeenCalledWith('keyword', 'mapPackTop3', {
          transaction: { transaction: 'mock' },
        });
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

      test('migration up and down skip gracefully when the table does not exist, and a successful up does not throw', async () => {
        const migration = require('../../database/migrations/1710000000000-add-keyword-state-field');
        const { DataTypes } = require('sequelize');

        // Table missing: both directions complete and log a skip message
        const missingTable = {
          sequelize: {
            transaction: jest.fn((callback) => callback({ transaction: 'mock' })),
          },
          describeTable: jest.fn().mockRejectedValue(new Error('Table does not exist')),
        };

        await expect(migration.up({ context: missingTable })).resolves.not.toThrow();
        expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Skipping migration - keyword table does not exist yet');

        await expect(migration.down({ context: missingTable })).resolves.not.toThrow();
        expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Skipping rollback - keyword table does not exist');

        // Table present without the field: up completes without throwing
        const presentTable = {
          sequelize: {
            transaction: jest.fn(async (callback) => await callback({ transaction: 'mock' })),
            constructor: { DataTypes },
          },
          describeTable: jest.fn().mockResolvedValue({
            // Simulate table without the 'state' field
          }),
          addColumn: jest.fn().mockResolvedValue(undefined),
        };

        await expect(migration.up({ context: presentTable }, { DataTypes })).resolves.not.toThrow();
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

    });
  });

  describe('notification-email-copy.migration.test.ts', () => {
    describe('copy global notification email to domains migration', () => {
      type QueryCall = { sql: string, options?: Record<string, any> };

      // A fake query interface that records the SQL it receives and answers the table-existence check
      const makeQueryInterface = (
        existingTables: string[],
        rows: unknown[] = [],
        columns: Record<string, unknown> = { history: {}, history7d: {}, lastResult: {} },
      ) => {
        const calls: QueryCall[] = [];
        const query = jest.fn(async (sql: string, options?: Record<string, any>) => {
          calls.push({ sql, options });
          if (sql.includes('sqlite_master')) {
            const match = /name='(\w+)'/.exec(sql);
            return [existingTables.filter((table) => table === match?.[1]).map((name) => ({ name }))];
          }
          if (sql.startsWith('PRAGMA table_info')) { return Object.keys(columns).map((name) => ({ name })); }
          if (sql.startsWith('SELECT ID, history') || sql.startsWith('SELECT ID, lastResult')) { return rows; }
          return [{ changes: 2 }];
        });
        const queryInterface = {
          sequelize: { query, transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}), constructor: { QueryTypes: { SELECT: 'SELECT' } } },
          describeTable: jest.fn(async () => columns),
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

      it('changes nothing without a global address, and does not fail when the domain table does not exist', async () => {
        const first = makeQueryInterface(['domain']);
        await notificationEmailMigration.up({ context: first.queryInterface });
        expect(updates(first.calls)).toHaveLength(0);

        writeSettings({ notification_email: '   ' });
        const second = makeQueryInterface(['domain']);
        await notificationEmailMigration.up({ context: second.queryInterface });
        expect(updates(second.calls)).toHaveLength(0);

        writeSettings({ notification_email: 'team@example.com' });
        const missingTable = makeQueryInterface([]);
        await expect(notificationEmailMigration.up({ context: missingTable.queryInterface })).resolves.toBeUndefined();
        expect(updates(missingTable.calls)).toHaveLength(0);
      });

      it('keyword JSON migrations check the keyword table through sqlite_master and rewrite only the rows that change', async () => {
        const missing = makeQueryInterface([]);
        await expect(historyDateKeyMigration.up({ context: missing.queryInterface })).resolves.toBeUndefined();
        expect(missing.queryInterface.describeTable).not.toHaveBeenCalled();

        const present = makeQueryInterface(['keyword'], [{ ID: 7, history: '{"2026-1-5":3}', history7d: '{}' }]);
        await historyDateKeyMigration.up({ context: present.queryInterface });
        const update = present.calls.find((call) => call.sql.startsWith('UPDATE keyword'));
        expect(JSON.parse(update?.options?.replacements.history)).toEqual({ '2026-01-05': 3 });
        expect(update?.options?.replacements.id).toBe(7);

        // Skipped lastResult placeholders: a missing table or missing column is skipped without reading rows
        const noTable = makeQueryInterface([], [{ ID: 1, lastResult: '[{"skipped":true}]' }]);
        await expect(skippedLastResultMigration.up({ context: noTable.queryInterface })).resolves.toBeUndefined();
        expect(noTable.calls.some((call) => call.sql.startsWith('SELECT ID, lastResult'))).toBe(false);

        const noColumn = makeQueryInterface(['keyword'], [{ ID: 1, lastResult: '[{"skipped":true}]' }], { history: {} });
        await expect(skippedLastResultMigration.up({ context: noColumn.queryInterface })).resolves.toBeUndefined();
        expect(noColumn.calls.some((call) => call.sql.startsWith('SELECT ID, lastResult'))).toBe(false);

        // Removes skipped entries, keeps real ones, leaves invalid, empty, null and non-array values untouched
        const realEntry = { position: 3, url: 'https://a.example/', title: 'A' };
        const legacyRows = [
          { ID: 1, lastResult: JSON.stringify([realEntry, { position: 0, url: '', title: '', skipped: true }]) },
          { ID: 2, lastResult: JSON.stringify([{ position: 1, url: 'https://b.example/', title: 'B' }]) },
          { ID: 3, lastResult: '[{"position":' },
          { ID: 4, lastResult: '{"skipped":true}' },
          { ID: 5, lastResult: '' },
          { ID: 6, lastResult: null },
          { ID: 7, lastResult: JSON.stringify([{ position: 0, url: '', title: '', skipped: true }]) },
        ];
        const legacy = makeQueryInterface(['keyword'], legacyRows);
        await skippedLastResultMigration.up({ context: legacy.queryInterface });
        const legacyUpdates = legacy.calls.filter((call) => call.sql.startsWith('UPDATE keyword'));
        expect(legacyUpdates.map((call) => call.options?.replacements.id)).toEqual([1, 7]);
        expect(legacyUpdates[0].options?.replacements.lastResult).toBe(JSON.stringify([realEntry]));
        expect(legacyUpdates[1].options?.replacements.lastResult).toBe('[]');

        // Second run over the cleaned rows changes nothing
        const cleaned = makeQueryInterface(['keyword'], [
          { ID: 1, lastResult: legacyUpdates[0].options?.replacements.lastResult },
          { ID: 2, lastResult: legacyRows[1].lastResult },
          { ID: 3, lastResult: legacyRows[2].lastResult },
        ]);
        await skippedLastResultMigration.up({ context: cleaned.queryInterface });
        expect(cleaned.calls.filter((call) => call.sql.startsWith('UPDATE keyword'))).toHaveLength(0);

        // Real SQLite file: the rows change, a backup is written once, and a second run leaves the file alone
        const dbDir = mkdtempSync(path.join(os.tmpdir(), 'skipped-lastresult-'));
        try {
          const scriptResult = execFileSync(process.execPath, ['-e', `
            const fs = require('fs');
            const path = require('path');
            const { Sequelize } = require(${JSON.stringify(path.resolve(__dirname, '../../node_modules/sequelize'))});
            const sqliteDialect = require(${JSON.stringify(path.resolve(__dirname, '../../database/sqlite-dialect.js'))});
            const mig = require(${JSON.stringify(path.resolve(__dirname, '../../database/migrations/1790000000001-strip-skipped-lastresult-entries.js'))});
            const dir = ${JSON.stringify(dbDir)};
            const seq = new Sequelize({ dialect: 'sqlite', dialectModule: sqliteDialect, storage: path.join(dir, 'test.sqlite'), logging: false });
            const qi = seq.getQueryInterface();
            const backups = () => fs.readdirSync(dir).filter((name) => name.includes('.bak-')).length;
            (async () => {
              try {
                await seq.query('CREATE TABLE keyword (ID INTEGER PRIMARY KEY AUTOINCREMENT, keyword VARCHAR(255), domain VARCHAR(255), device VARCHAR(255), location TEXT, lastResult TEXT)');
                // Expression index like the real keyword_tracking_target_idx: describeTable throws on it
                await seq.query("CREATE UNIQUE INDEX keyword_tracking_target_idx ON keyword (domain, keyword, device, COALESCE(location, ''))");
                for (const value of ${JSON.stringify(legacyRows.map((row) => row.lastResult))}) {
                  await seq.query('INSERT INTO keyword (keyword, lastResult) VALUES (:value, :lastResult)', { replacements: { value: 'k', lastResult: value } });
                }
                await mig.up({ context: qi });
                const afterFirst = await seq.query('SELECT ID, lastResult FROM keyword ORDER BY ID', { type: 'SELECT' });
                const backupsAfterFirst = backups();
                await mig.up({ context: qi });
                const afterSecond = await seq.query('SELECT ID, lastResult FROM keyword ORDER BY ID', { type: 'SELECT' });
                console.log('RESULT' + JSON.stringify({ afterFirst, afterSecond, backupsAfterFirst, backupsAfterSecond: backups() }));
              } finally {
                await seq.close();
              }
            })().catch((error) => { console.error(error); process.exit(1); });
          `], { encoding: 'utf8' });
          const line = scriptResult.split('\n').find((text) => text.startsWith('RESULT'));
          const sqliteResult = JSON.parse(line!.slice('RESULT'.length));

          expect(sqliteResult.afterFirst.map((row: { lastResult: string }) => row.lastResult)).toEqual([
            JSON.stringify([realEntry]),
            legacyRows[1].lastResult,
            legacyRows[2].lastResult,
            legacyRows[3].lastResult,
            legacyRows[4].lastResult,
            legacyRows[5].lastResult,
            '[]',
          ]);
          expect(sqliteResult.afterSecond).toEqual(sqliteResult.afterFirst);
          expect(sqliteResult.backupsAfterFirst).toBe(1);
          expect(sqliteResult.backupsAfterSecond).toBe(1);
        } finally {
          rmSync(dbDir, { recursive: true, force: true });
        }
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

      it('clears removed per-domain scraper overrides, preserves active ones, and is idempotent once none remain', async () => {
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

        // Running again once nothing removed remains only issues the SELECT
        const rerunQuery = jest.fn().mockResolvedValueOnce([[
          { ID: 2, scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'keep' }) },
          { ID: 4, scraper_settings: null },
        ]]);
        const rerunInterface = {
          sequelize: {
            transaction: jest.fn(async (callback) => callback({ transaction: 'mock' })),
            query: rerunQuery,
          },
          describeTable: jest.fn().mockResolvedValue({ scraper_settings: { type: 'TEXT' } }),
        };

        await expect(migration.up({ context: rerunInterface })).resolves.not.toThrow();
        expect(rerunQuery).toHaveBeenCalledTimes(1);
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

      it('makes United States the country default, changes US locations to United States, and keeps the existing indexes', () => {
        const result = runScenario(`
          await run();
          await mig.up({ context: qi });
          result = {
            countryDefault: await columnDefault('country'),
            locationDefault: await columnDefault('location'),
            rows: await q('SELECT keyword, location, country FROM keyword ORDER BY ID'),
            indexes: await q("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='keyword'"),
          };
        `);

        expect(result).toEqual({
          countryDefault: "'United States'",
          locationDefault: "''",
          rows: [
            { keyword: 'alpha', location: 'United States', country: 'US' },
            { keyword: 'beta', location: 'Austin,TX,United States', country: 'US' },
          ],
          indexes: expect.arrayContaining([{ name: 'keyword_domain_idx' }]),
        });
      });

      it('keeps the ID counter so deleted IDs are not reused, and gives a new row without a country the new default', () => {
        const result = runScenario(`
          await run();
          await mig.up({ context: qi });
          await seq.query("INSERT INTO keyword (keyword, domain) VALUES ('delta', 'a.com')");
          result = {
            id: await q("SELECT ID FROM keyword WHERE keyword = 'delta'"),
            defaults: await q("SELECT country, location FROM keyword WHERE keyword = 'delta'"),
          };
        `);

        expect(result).toEqual({ id: [{ ID: 4 }], defaults: [{ country: 'United States', location: '' }] });
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

      it('writes a trailing country code as the full name, keeps commas inside the city name, and canonicalizes a country typed in any case', () => {
        expect(normalizeLocation('Port Charlotte,Florida,US', 'US')).toBe('Port Charlotte,Florida,United States');
        expect(normalizeLocation('Washington,D.C.,District of Columbia,US', 'US'))
          .toBe('Washington,D.C.,District of Columbia,United States');
        expect(normalizeLocation('Port Charlotte,Florida,UNITED STATES', 'US')).toBe('Port Charlotte,Florida,United States');
      });

      it('keeps a city with commas when the country is already a name', () => {
        expect(normalizeLocation('Washington,D.C.,District of Columbia,United States', 'US'))
          .toBe('Washington,D.C.,District of Columbia,United States');
      });

      it('clears country-only values and returns blank when only a city is left', () => {
        expect(normalizeLocation('US', 'US')).toBe('');
        expect(normalizeLocation('UNITED STATES', 'US')).toBe('');
        expect(normalizeLocation('', 'US')).toBe('');
        expect(normalizeLocation('Miami,US', 'US')).toBe('');
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

      it('keeps the row with the most history and merges tags and the star; on a history tie keeps the lowest ID and treats null and empty location as the same target', () => {
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

        const [tie] = planDuplicateRemovals([row({ ID: 9, location: null }), row({ ID: 4, location: '' })]);
        expect(tie.keepID).toBe(4);
        expect(tie.deleteIDs).toEqual([9]);
        expect(tie.tagsChanged).toBe(false);
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

  describe('stale-updating-flags.migration.test.ts', () => {
    describe('reset stale updating flags migration', () => {
      const { logger } = require('../../database/migrationLogger') as {
        logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock }
      };

      // Answers the three queries the migration makes: table check, PRAGMA column list, and the stale row count
      const makeQueryInterface = ({ tables = ['keyword'], columns = ['ID', 'updating', 'updatingStartedAt'], staleCount = 2 } = {}) => {
        const calls: string[] = [];
        const query = jest.fn(async (sql: string) => {
          calls.push(sql);
          if (sql.includes('sqlite_master')) { return [tables.map((name) => ({ name }))]; }
          if (sql.startsWith('PRAGMA table_info')) { return columns.map((name) => ({ name })); }
          if (sql.startsWith('SELECT COUNT(*)')) { return [{ count: staleCount }]; }
          return [{}];
        });
        const queryInterface = {
          sequelize: {
            constructor: { QueryTypes: { SELECT: 'SELECT' } },
            transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
            query,
          },
        };
        return { queryInterface, calls };
      };

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('clears truthy updating flags, does nothing when none are left, and skips without failing when the table is missing', async () => {
        const { queryInterface, calls } = makeQueryInterface({ staleCount: 2 });

        await staleUpdatingFlagsMigration.up({ context: queryInterface });

        const update = calls.find((sql) => sql.startsWith('UPDATE keyword'));
        expect(update).toBe('UPDATE keyword SET updating = 0, updatingStartedAt = NULL WHERE updating');
        expect(logger.info).toHaveBeenCalledWith('[MIGRATION] Reset stale updating flag on 2 keyword row(s)');

        calls.length = 0;
        jest.clearAllMocks();
        await staleUpdatingFlagsMigration.up({ context: makeQueryInterface({ staleCount: 0 }).queryInterface });
        expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Reset stale updating flag'));

        const missing = makeQueryInterface({ tables: [] });
        await expect(staleUpdatingFlagsMigration.up({ context: missing.queryInterface })).resolves.toBeUndefined();
        expect(missing.calls.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('keyword table does not exist'));
      });
    });

    describe('backup database file helper', () => {
      let dir: string;

      beforeEach(() => {
        dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-backup-'));
      });

      afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
      });

      it('backs up committed WAL data once per day and never overwrites an existing backup; skips :memory:', async () => {
        const file = path.join(dir, 'database.sqlite');
        const now = new Date(2026, 10, 4, 12, 0, 0);
        const script = `
          const Database = require('better-sqlite3');
          const { backupDatabaseFile } = require(${JSON.stringify(path.resolve(__dirname, '../../database/backupDatabase.js'))});
          (async () => {
            const file = process.argv[1];
            const database = new Database(file);
            database.pragma('journal_mode = WAL');
            database.exec('CREATE TABLE keyword (ID INTEGER PRIMARY KEY, keyword TEXT)');
            database.prepare('INSERT INTO keyword (keyword) VALUES (?)').run('plumber');
            database.prepare('INSERT INTO keyword (keyword) VALUES (?)').run('electrician');
            const queryInterface = { sequelize: { options: { storage: file } } };
            const now = new Date(2026, 10, 4, 12, 0, 0);
            const backupPath = await backupDatabaseFile(queryInterface, now);
            const backup = new Database(backupPath, { readonly: true });
            const rows = backup.prepare('SELECT keyword FROM keyword ORDER BY ID').all();
            if (JSON.stringify(rows) !== JSON.stringify([{ keyword: 'plumber' }, { keyword: 'electrician' }])) process.exit(2);
            backup.close();
            if (await backupDatabaseFile(queryInterface, now) !== null) process.exit(3);
            database.close();
          })().catch((error) => { console.error(error); process.exit(1); });
        `;
        execFileSync(process.execPath, ['-e', script, file], { cwd: path.resolve(__dirname, '../..') });
        expect(await backupDatabaseFile({ sequelize: { options: { storage: ':memory:' } } }, now)).toBeNull();
      });
    });
  });

  describe('drop-domain-notification-interval.migration.test.ts', () => {
    describe('drop domain notification interval migration', () => {
      // Answers the three queries the migration makes: table check, PRAGMA column list, and the DROP itself
      const makeQueryInterface = ({ tables = ['domain'], columns = ['ID', 'domain', 'notification_interval', 'notification_emails'] } = {}) => {
        const calls: string[] = [];
        const query = jest.fn(async (sql: string) => {
          calls.push(sql);
          if (sql.includes('sqlite_master')) { return [tables.map((name) => ({ name }))]; }
          if (sql.startsWith('PRAGMA table_info')) { return columns.map((name) => ({ name })); }
          return [{}];
        });
        const queryInterface = {
          sequelize: {
            constructor: { QueryTypes: { SELECT: 'SELECT' } },
            transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
            query,
          },
        };
        return { queryInterface, calls };
      };

      beforeEach(() => {
        jest.clearAllMocks();
      });

      it('drops the notification_interval and domain.tags columns when present, does nothing when already gone, and skips without failing when the table is missing', async () => {
        const { queryInterface, calls } = makeQueryInterface();

        await dropDomainNotificationIntervalMigration.up({ context: queryInterface });
        expect(calls).toContain('ALTER TABLE domain DROP COLUMN notification_interval');

        const second = makeQueryInterface({ columns: ['ID', 'domain', 'notification_emails'] });
        await dropDomainNotificationIntervalMigration.up({ context: second.queryInterface });
        expect(second.calls.some((sql) => sql.startsWith('ALTER TABLE'))).toBe(false);

        const missing = makeQueryInterface({ tables: [] });
        await expect(dropDomainNotificationIntervalMigration.up({ context: missing.queryInterface })).resolves.toBeUndefined();
        expect(missing.calls.some((sql) => sql.startsWith('ALTER TABLE'))).toBe(false);

        // 1790000000002 drops domain.tags through describeTable and removeColumn; the table state is kept in memory
        const makeTagsInterface = ({ hasTable = true, columns = ['ID', 'domain', 'tags'] } = {}) => {
           const state = new Set(columns);
           const removeColumn = jest.fn(async (_table: string, column: string) => { state.delete(column); });
           const addColumn = jest.fn(async (_table: string, column: string) => { state.add(column); });
           const describeTable = jest.fn(async () => {
              if (!hasTable) { throw new Error('no such table: domain'); }
              return Object.fromEntries([...state].map((name) => [name, {}]));
           });
           const queryInterface = {
              describeTable,
              removeColumn,
              addColumn,
              sequelize: {
                 options: {},
                 transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
              },
           };
           return { queryInterface, removeColumn, state };
        };

        const tags = makeTagsInterface();
        await dropDomainTagsMigration.up({ context: tags.queryInterface });
        expect(tags.removeColumn).toHaveBeenCalledWith('domain', 'tags', expect.anything());
        expect(tags.state.has('tags')).toBe(false);

        // A second run finds the column gone and changes nothing
        await dropDomainTagsMigration.up({ context: tags.queryInterface });
        expect(tags.removeColumn).toHaveBeenCalledTimes(1);

        const noTable = makeTagsInterface({ hasTable: false });
        await expect(dropDomainTagsMigration.up({ context: noTable.queryInterface })).resolves.toBeUndefined();
        expect(noTable.removeColumn).not.toHaveBeenCalled();
      });
    });
  });
});

describe('replace smart strategy', () => {
  /* eslint-disable security/detect-non-literal-fs-filename -- only writes to a temp directory created by the test */

  // better-sqlite3 is mocked under jest, so the SQL is checked through a recording query interface
  const makeQueryInterface = ({ tables = ['domain'], columns = ['ID', 'domain', 'scrape_strategy'], smartRows = 2 } = {}) => {
    const calls: string[] = [];
    const query = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('sqlite_master')) { return [tables.map((name) => ({ name }))]; }
      if (sql.startsWith('SELECT COUNT(*)')) { return [[{ total: smartRows }]]; }
      return [{}];
    });
    const queryInterface = {
      sequelize: { query, transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}) },
      describeTable: jest.fn(async () => Object.fromEntries(columns.map((name) => [name, {}]))),
    };
    return { queryInterface, calls };
  };

  describe('replace-smart-scrape-strategy.migration', () => {
    let dir: string;
    let cwdSpy: jest.SpyInstance;

    const writeSettings = (value: unknown) => writeFileSync(path.join(dir, 'data', 'settings.json'), JSON.stringify(value), 'utf-8');
    const readSettings = () => JSON.parse(readFileSync(path.join(dir, 'data', 'settings.json'), 'utf-8'));

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'smart-strategy-'));
      mkdirSync(path.join(dir, 'data'));
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    });

    it('sets only smart domains to basic', async () => {
      const { queryInterface, calls } = makeQueryInterface();

      await migration.up({ context: queryInterface });

      expect(calls).toContain("UPDATE domain SET scrape_strategy = 'basic' WHERE scrape_strategy = 'smart'");
      expect(calls.filter((sql) => sql.startsWith('UPDATE'))).toHaveLength(1);
    });

    it('replaces a global smart strategy in settings.json and keeps other settings', async () => {
      writeSettings({ scrape_strategy: 'smart', scrape_pagination_limit: 5 });

      await migration.up({ context: makeQueryInterface().queryInterface });

      expect(readSettings()).toEqual({ scrape_strategy: 'basic', scrape_pagination_limit: 5 });
    });

    it('writes settings.json atomically and leaves no temp file behind', () => {
      writeSettings({ scrape_strategy: 'smart' });
      expect(migration.replaceGlobalSmartStrategy()).toBe(true);
      expect(readdirSync(path.join(dir, 'data'))).toEqual(['settings.json']);
    });

    it('leaves settings.json alone when nothing needs changing, copes with a missing file, and drops removed settings keys once', async () => {
      await expect(migration.up({ context: makeQueryInterface().queryInterface })).resolves.toBeUndefined();

      writeSettings({ scrape_strategy: 'custom' });
      await migration.up({ context: makeQueryInterface().queryInterface });
      expect(readSettings()).toEqual({ scrape_strategy: 'custom' });

      // The removed-keys migration (1781000000000) copes with a missing file and is idempotent
      await expect(dropMigration.up()).resolves.toBeUndefined();
      writeSettings({ scrape_strategy: 'custom', search_console: true, white_label_enabled: true, white_label_logo_file: 'logo.png', platform_name: 'Acme', notification_email: 'global@example.com' });
      await dropMigration.up();
      expect(readSettings()).toEqual({ scrape_strategy: 'custom' });
      await dropMigration.up();
      expect(readSettings()).toEqual({ scrape_strategy: 'custom' });
    });

    it('still fixes settings.json and skips the update when the domain table is missing or has no scrape_strategy column', async () => {
      writeSettings({ scrape_strategy: 'smart' });
      const missingTable = makeQueryInterface({ tables: [] });

      await migration.up({ context: missingTable.queryInterface });

      expect(missingTable.calls.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
      expect(readSettings().scrape_strategy).toBe('basic');

      const missingColumn = makeQueryInterface({ columns: ['ID', 'domain'] });
      await migration.up({ context: missingColumn.queryInterface });
      expect(missingColumn.calls.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
    });
  });
});

describe('keyword volume integer', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const MIGRATION = path.join(ROOT, 'database/migrations/1780000000000-keyword-volume-integer-country-default.js');

  // Jest maps better-sqlite3 to a mock, so the rebuild runs in a plain Node process with a real SQLite file.
  const runScenario = (body: string): any => {
    const script = `
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { Sequelize } = require(${JSON.stringify(path.join(ROOT, 'node_modules/sequelize'))});
  const sqliteDialect = require(${JSON.stringify(path.join(ROOT, 'database/sqlite-dialect.js'))});
  const mig = require(${JSON.stringify(MIGRATION)});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyword-volume-'));
  const seq = new Sequelize({ dialect: 'sqlite', dialectModule: sqliteDialect, storage: path.join(dir, 'test.sqlite'), logging: false });
  const q = (sql) => seq.query(sql, { type: 'SELECT' });
  const qi = seq.getQueryInterface();
  (async () => {
    try {
      await seq.query("CREATE TABLE \`keyword\` (\`ID\` INTEGER PRIMARY KEY AUTOINCREMENT, \`keyword\` VARCHAR(255) NOT NULL, \`device\` VARCHAR(255) DEFAULT 'desktop', \`country\` VARCHAR(255) DEFAULT 'United States', \`location\` VARCHAR(255) DEFAULT '', \`domain\` VARCHAR(255) NOT NULL DEFAULT '')");
      await seq.query("ALTER TABLE \`keyword\` ADD \`volume\` VARCHAR(255) NOT NULL DEFAULT 0");
      await seq.query("CREATE UNIQUE INDEX keyword_tracking_target_idx ON keyword (domain, keyword, COALESCE(country, ''), COALESCE(location, ''), COALESCE(device, ''))");
      await seq.query("CREATE INDEX keyword_updating_idx ON keyword (domain)");
      await seq.query("INSERT INTO keyword (keyword, domain, country, volume) VALUES ('a', 'x.com', 'GB', '9.0'), ('b', 'x.com', 'US', '1200.0'), ('c', 'x.com', 'US', 'junk')");
      await seq.query("INSERT INTO keyword (keyword, domain) VALUES ('d', 'x.com')");
      await seq.query("DELETE FROM keyword WHERE keyword = 'd'");
      let result;
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

  describe('keyword volume integer and country default migration', () => {
    it('converts volume to INTEGER so it sorts numerically, keeps data, indexes and the ID counter', () => {
      const result = runScenario(`
        await mig.up({ context: qi });
        await mig.up({ context: qi });
        await seq.query("INSERT INTO keyword (keyword, domain) VALUES ('e', 'x.com')");
        result = {
          type: (await q('PRAGMA table_info(keyword)')).find((c) => c.name === 'volume').type,
          order: await q("SELECT keyword, volume, typeof(volume) AS t FROM keyword WHERE keyword != 'e' ORDER BY volume DESC"),
          newRow: (await q("SELECT ID, country, volume FROM keyword WHERE keyword = 'e'"))[0],
          indexes: (await q("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='keyword' AND sql IS NOT NULL ORDER BY name")).map((r) => r.name),
        };
      `);

      expect(result.type).toBe('INTEGER');
      expect(result.order).toEqual([
        { keyword: 'b', volume: 1200, t: 'integer' },
        { keyword: 'a', volume: 9, t: 'integer' },
        { keyword: 'c', volume: 0, t: 'integer' },
      ]);
      expect(result.newRow).toEqual({ ID: 5, country: 'US', volume: 0 });
      expect(result.indexes).toEqual(['keyword_tracking_target_idx', 'keyword_updating_idx']);
    });

    it('plans nothing when the table already matches the model', () => {
      const { planKeywordAlignment } = require(MIGRATION);
      expect(planKeywordAlignment([{ name: 'volume', type: 'INTEGER' }, { name: 'country', dflt_value: "'US'" }])).toBeNull();
      expect(planKeywordAlignment([{ name: 'volume', type: 'VARCHAR(255)' }, { name: 'country', dflt_value: "'US'" }]))
        .toEqual({ volumeNeedsInteger: true, countryNeedsDefault: false });
    });
  });
});

describe('www domains', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const MIGRATION = path.join(ROOT, 'database/migrations/1778000000000-normalize-www-domains-and-decode-keywords.js');

  // Jest maps better-sqlite3 to a mock, so this runs in a plain Node process with a real SQLite file.
  const runScenario = (body: string): any => {
    const script = `
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { Sequelize } = require(${JSON.stringify(path.join(ROOT, 'node_modules/sequelize'))});
  const sqliteDialect = require(${JSON.stringify(path.join(ROOT, 'database/sqlite-dialect.js'))});
  const mig = require(${JSON.stringify(MIGRATION)});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'www-migration-'));
  process.chdir(dir);
  const seq = new Sequelize({ dialect: 'sqlite', dialectModule: sqliteDialect, storage: path.join(dir, 'test.sqlite'), logging: false });
  const q = (sql) => seq.query(sql, { type: 'SELECT' });
  const qi = seq.getQueryInterface();
  (async () => {
    try {
      await seq.query("CREATE TABLE domain (ID INTEGER PRIMARY KEY AUTOINCREMENT, domain VARCHAR(255), slug VARCHAR(255))");
      await seq.query("CREATE TABLE keyword (ID INTEGER PRIMARY KEY AUTOINCREMENT, keyword VARCHAR(255), domain VARCHAR(255), country VARCHAR(255), location VARCHAR(255), device VARCHAR(255))");
      await seq.query("CREATE UNIQUE INDEX keyword_tracking_target_idx ON keyword (domain, keyword, COALESCE(country, ''), COALESCE(location, ''), COALESCE(device, ''))");
      await seq.query("INSERT INTO domain (domain, slug) VALUES ('www.example.com', 'www-example-com')");
      await seq.query("INSERT INTO keyword (keyword, domain, country, location, device) VALUES ('alpha', 'www.example.com', 'US', '', 'desktop'), ('beta', 'www.example.com', 'US', '', 'desktop'), ('alpha', 'example.com', 'US', '', 'desktop')");
      let result;
      ${body}
      console.log('RESULT' + JSON.stringify(result));
    } finally {
      await seq.close();
      process.chdir(${JSON.stringify(ROOT)});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })().catch((error) => { console.error(error); process.exit(1); });
  `;
    const output = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    const line = output.split('\n').find((text) => text.startsWith('RESULT'));
    if (!line) { throw new Error(`No result from scenario:\n${output}`); }
    return JSON.parse(line.slice('RESULT'.length));
  };

  describe('normalize www domains migration', () => {
    it('renames keywords one by one and leaves a colliding orphan row alone instead of failing', () => {
      const result = runScenario(`
        await mig.up({ context: qi });
        result = {
          domains: await q('SELECT domain, slug FROM domain'),
          keywords: await q('SELECT keyword, domain FROM keyword ORDER BY ID'),
        };
      `);

      expect(result.domains).toEqual([{ domain: 'example.com', slug: 'example-com' }]);
      expect(result.keywords).toEqual([
        { keyword: 'alpha', domain: 'www.example.com' },
        { keyword: 'beta', domain: 'example.com' },
        { keyword: 'alpha', domain: 'example.com' },
      ]);
    });
  });
});
