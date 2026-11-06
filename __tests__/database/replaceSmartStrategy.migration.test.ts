/** @jest-environment node */

/* eslint-disable security/detect-non-literal-fs-filename -- only writes to a temp directory created by the test */

jest.mock('../../database/migrationLogger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { readdirSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import migration from '../../database/migrations/1779000000000-replace-smart-scrape-strategy.js';
import dropMigration from '../../database/migrations/1781000000000-drop-removed-settings-keys.js';

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
    writeSettings({ scrape_strategy: 'custom', search_console: true, white_label_enabled: true, white_label_logo_file: 'logo.png', platform_name: 'Acme' });
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
