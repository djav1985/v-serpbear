/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
export {};

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { withSettingsLock } from '../../utils/settingsFile';

describe('withSettingsLock', () => {
  let dir: string;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-lock-'));
    mkdirSync(path.join(dir, 'data'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates settings.json as {} when it is missing', async () => {
    await withSettingsLock(async () => undefined);

    expect(readFileSync(path.join(dir, 'data', 'settings.json'), 'utf-8')).toBe('{}');
  });

  it('runs overlapping critical sections one after the other', async () => {
    writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');
    const order: string[] = [];
    const section = (name: string) => withSettingsLock(async () => {
      order.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      order.push(`${name}:end`);
    });

    await Promise.all([section('a'), section('b')]);

    // Whichever section starts first must also finish before the other one starts
    const first = order[0].split(':')[0];
    expect(order).toEqual([`${first}:start`, `${first}:end`, `${first === 'a' ? 'b' : 'a'}:start`, `${first === 'a' ? 'b' : 'a'}:end`]);
  });

  it('releases the lock when the section throws', async () => {
    writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');

    await expect(withSettingsLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(withSettingsLock(async () => 'next')).resolves.toBe('next');
    expect(existsSync(path.join(dir, 'data', 'settings.json'))).toBe(true);
  });
});
