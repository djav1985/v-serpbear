/**
 * @jest-environment node
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

// Runs in plain Node against a real SQLite file: jest maps the SQLite driver to a mock
describe('keyword.mapPackRemovedAt migrations', () => {
   it('add the column on a table with an expression index, repair a skipped run and skip a missing table', () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-map-pack-removed-'));
      const root = path.resolve(__dirname, '../..');
      try {
         const output = execFileSync(process.execPath, ['-e', `
            const path = require('path');
            const { Sequelize } = require(${JSON.stringify(path.join(root, 'node_modules/sequelize'))});
            const dialectModule = require(${JSON.stringify(path.join(root, 'database/sqlite-dialect.js'))});
            const add = require(${JSON.stringify(path.join(root, 'database/migrations/1790000000003-add-keyword-map-pack-removed-at.js'))});
            const repair = require(${JSON.stringify(path.join(root, 'database/migrations/1790000000004-repair-keyword-map-pack-removed-at.js'))});
            const seq = new Sequelize({ dialect: 'sqlite', dialectModule, storage: path.join(${JSON.stringify(dir)}, 'db.sqlite'), logging: false });
            const qi = seq.getQueryInterface();
            const columns = async () => (await seq.query('PRAGMA table_info(\`keyword\`)'))[0].map((row) => row.name);
            (async () => {
              const result = {};
              await add.up({ context: qi });
              await repair.up({ context: qi });
              result.missingTable = (await columns()).length;
              await seq.query('CREATE TABLE keyword (ID INTEGER PRIMARY KEY, keyword TEXT, domain TEXT, country TEXT)');
              await seq.query("CREATE UNIQUE INDEX keyword_tracking_target_idx ON keyword (domain, keyword, COALESCE(country, ''))");
              // The expression index is what makes Sequelize's SQLite describeTable throw
              result.describeThrows = await qi.describeTable('keyword').then(() => false, () => true);
              await add.up({ context: qi });
              result.added = (await columns()).includes('mapPackRemovedAt');
              await add.up({ context: qi });
              await repair.up({ context: qi });
              result.addedOnce = (await columns()).filter((name) => name === 'mapPackRemovedAt').length;
              await add.down({ context: qi });
              result.removed = !(await columns()).includes('mapPackRemovedAt');
              await repair.up({ context: qi });
              result.repaired = (await columns()).includes('mapPackRemovedAt');
              console.log('RESULT' + JSON.stringify(result));
              await seq.close();
            })().catch((error) => { console.error(error); process.exit(1); });
         `], { encoding: 'utf8' });
         const line = output.split('\n').find((text) => text.startsWith('RESULT'));
         expect(JSON.parse((line ?? 'RESULT{}').slice('RESULT'.length))).toEqual({
            missingTable: 0,
            describeThrows: true,
            added: true,
            addedOnce: 1,
            removed: true,
            repaired: true,
         });
      } finally {
         rmSync(dir, { recursive: true, force: true });
      }
   });
});
