/** @jest-environment node */

export {};

import { execFileSync } from 'child_process';
import path from 'path';

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

describe('keyword country default migration', () => {
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
