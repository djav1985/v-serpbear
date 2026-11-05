/** @jest-environment node */

import { execFileSync } from 'child_process';
import path from 'path';

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
