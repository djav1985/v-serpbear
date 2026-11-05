/** @jest-environment node */

/* eslint-disable security/detect-non-literal-fs-filename -- only writes to a temp directory created by the test */

jest.mock('../../database/migrationLogger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import migration from '../../database/migrations/1779000000000-replace-smart-scrape-strategy.js';

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

  it('leaves settings.json alone when the global strategy is not smart, and copes with a missing file', async () => {
    await expect(migration.up({ context: makeQueryInterface().queryInterface })).resolves.toBeUndefined();

    writeSettings({ scrape_strategy: 'custom' });
    await migration.up({ context: makeQueryInterface().queryInterface });
    expect(readSettings()).toEqual({ scrape_strategy: 'custom' });
  });

  it('still fixes settings.json and skips the update when the domain table does not exist', async () => {
    writeSettings({ scrape_strategy: 'smart' });
    const { queryInterface, calls } = makeQueryInterface({ tables: [] });

    await migration.up({ context: queryInterface });

    expect(calls.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
    expect(readSettings().scrape_strategy).toBe('basic');
  });

  it('skips the update when the domain table has no scrape_strategy column', async () => {
    const { queryInterface, calls } = makeQueryInterface({ columns: ['ID', 'domain'] });

    await migration.up({ context: queryInterface });

    expect(calls.some((sql) => sql.startsWith('UPDATE'))).toBe(false);
  });
});
