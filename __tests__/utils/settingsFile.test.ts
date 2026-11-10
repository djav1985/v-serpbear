import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { readSettingsFile, withSettingsLock } from '../../utils/settingsFile';
import { createTempAppDataDir } from '../__helpers__';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
describe('settings file lock', () => {
  /* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */


  describe('withSettingsLock', () => {
    let dir: string;
    let tempData: ReturnType<typeof createTempAppDataDir>;

    beforeEach(() => {
      tempData = createTempAppDataDir('serpbear-lock-');
      dir = tempData.dir;
    });

    afterEach(() => {
      tempData.cleanup();
    });

    it('creates settings.json as {} when it is missing', async () => {
      await withSettingsLock(async () => undefined);

      expect(readFileSync(path.join(dir, 'data', 'settings.json'), 'utf-8')).toBe('{}');
    });

    it('runs overlapping critical sections one after the other', async () => {
      writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');
      const order: string[] = [];
      const releaseFirst = deferred();
      const firstStarted = deferred();
      const section = (name: string) => withSettingsLock(async () => {
        order.push(`${name}:start`);
        if (name === 'a') {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
        order.push(`${name}:end`);
      });

      const first = section('a');
      await firstStarted.promise;
      const second = section('b');
      try {
        expect(order).toEqual(['a:start']);
        releaseFirst.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
      } finally {
        releaseFirst.resolve();
        await Promise.all([first, second]);
      }
    });

    it('releases the lock when the section throws', async () => {
      writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');

      await expect(withSettingsLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      await expect(withSettingsLock(async () => 'next')).resolves.toBe('next');
      expect(existsSync(path.join(dir, 'data', 'settings.json'))).toBe(true);
    });
  });

  describe('readSettingsFile', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-read-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reads a missing, empty or whitespace-only file as {}', async () => {
      const file = path.join(dir, 'settings.json');
      await expect(readSettingsFile(file)).resolves.toEqual({});
      writeFileSync(file, '');
      await expect(readSettingsFile(file)).resolves.toEqual({});
      writeFileSync(file, '   ');
      await expect(readSettingsFile(file)).resolves.toEqual({});
    });

    it('throws for non-empty invalid JSON instead of reading it as {}', async () => {
      const file = path.join(dir, 'settings.json');
      writeFileSync(file, '{"scraping_api": "enc", ');
      await expect(readSettingsFile(file)).rejects.toThrow(/not valid JSON/);
      writeFileSync(file, '[1,2]');
      await expect(readSettingsFile(file)).rejects.toThrow(/JSON object/);
    });

    it('returns the stored settings', async () => {
      const file = path.join(dir, 'settings.json');
      writeFileSync(file, '{"scraper_type":"none"}');
      await expect(readSettingsFile(file)).resolves.toEqual({ scraper_type: 'none' });
    });
  });
});
