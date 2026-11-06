/** @jest-environment node */

import { execFileSync } from 'child_process';
import path from 'path';

jest.mock('../../database/migrationLogger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

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
