/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
export {};

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import migration from '../../database/migrations/1715920000000-update-ideas-domain-slug.js';
import { toDomainSlug } from '../../utils/domainSlug';

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

    await migration.up();

    const saved = JSON.parse(readFileSync(file, 'utf-8'));
    expect(saved.settings.domainSlug).toBe(toDomainSlug(domain));
    expect(saved.keywords[0].domain).toBe(toDomainSlug(domain));
  });

  it('does nothing and does not fail when the data folder has no ideas files', async () => {
    writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');

    await expect(migration.up()).resolves.toBeUndefined();
  });
});
