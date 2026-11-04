/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
export {};

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import migration from '../../database/migrations/1774000000000-copy-global-notification-email-to-domains.js';
import historyMigration from '../../database/migrations/1773000000000-pad-history-date-keys.js';

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

describe('copy global notification email to domains migration', () => {
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

    await migration.up({ context: queryInterface });

    const [update] = updates(calls);
    expect(update.sql).toContain("notification_emails IS NULL OR TRIM(notification_emails) = ''");
    expect(update.options?.replacements).toEqual({ email: 'team@example.com' });
  });

  it('changes nothing without a global address or settings file', async () => {
    const first = makeQueryInterface(['domain']);
    await migration.up({ context: first.queryInterface });
    expect(updates(first.calls)).toHaveLength(0);

    writeSettings({ notification_email: '   ' });
    const second = makeQueryInterface(['domain']);
    await migration.up({ context: second.queryInterface });
    expect(updates(second.calls)).toHaveLength(0);
  });

  it('does not fail when the domain table does not exist', async () => {
    writeSettings({ notification_email: 'team@example.com' });
    const { queryInterface, calls } = makeQueryInterface([]);

    await expect(migration.up({ context: queryInterface })).resolves.toBeUndefined();
    expect(updates(calls)).toHaveLength(0);
  });

  it('history padding migration checks the keyword table through sqlite_master and pads stored rows', async () => {
    const missing = makeQueryInterface([]);
    await expect(historyMigration.up({ context: missing.queryInterface })).resolves.toBeUndefined();
    expect(missing.queryInterface.describeTable).not.toHaveBeenCalled();

    const present = makeQueryInterface(['keyword'], [{ ID: 7, history: '{"2026-1-5":3}', history7d: '{}' }]);
    await historyMigration.up({ context: present.queryInterface });
    const update = present.calls.find((call) => call.sql.startsWith('UPDATE keyword'));
    expect(JSON.parse(update?.options?.replacements.history)).toEqual({ '2026-01-05': 3 });
    expect(update?.options?.replacements.id).toBe(7);
  });
});
