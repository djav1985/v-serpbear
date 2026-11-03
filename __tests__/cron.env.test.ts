/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
export {};

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

describe('cron worker env file loading', () => {
  const keys = ['CRON_ENV_TEST_LOCAL', 'CRON_ENV_TEST_SHARED', 'CRON_ENV_TEST_ONLY_ENV', 'CRON_ENV_TEST_SHELL'];
  let savedEnv: Record<string, string | undefined>;
  let dir: string;
  let loadEnvFiles: (dir?: string) => void;

  beforeEach(() => {
    savedEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    keys.forEach((key) => { delete process.env[key]; });
    dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-env-'));
    jest.resetModules();
    ({ loadEnvFiles } = require('../cron.js'));
  });

  afterEach(() => {
    keys.forEach((key) => {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads .env when it is the only env file present', () => {
    writeFileSync(path.join(dir, '.env'), 'CRON_ENV_TEST_ONLY_ENV=from-env\n');

    loadEnvFiles(dir);

    expect(process.env.CRON_ENV_TEST_ONLY_ENV).toBe('from-env');
  });

  it('prefers .env.local over .env when both define a key', () => {
    writeFileSync(path.join(dir, '.env.local'), 'CRON_ENV_TEST_LOCAL=from-local\nCRON_ENV_TEST_SHARED=local-wins\n');
    writeFileSync(path.join(dir, '.env'), 'CRON_ENV_TEST_SHARED=env-file\nCRON_ENV_TEST_LOCAL=env-file\n');

    loadEnvFiles(dir);

    expect(process.env.CRON_ENV_TEST_SHARED).toBe('local-wins');
    expect(process.env.CRON_ENV_TEST_LOCAL).toBe('from-local');
  });

  it('keeps variables already in the process environment (for example from docker compose)', () => {
    process.env.CRON_ENV_TEST_SHELL = 'from-shell';
    writeFileSync(path.join(dir, '.env.local'), 'CRON_ENV_TEST_SHELL=from-local\n');
    writeFileSync(path.join(dir, '.env'), 'CRON_ENV_TEST_SHELL=from-env\n');

    loadEnvFiles(dir);

    expect(process.env.CRON_ENV_TEST_SHELL).toBe('from-shell');
  });

  it('does not fail when neither env file exists', () => {
    expect(() => loadEnvFiles(dir)).not.toThrow();
  });
});
