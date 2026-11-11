import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

describe('cron worker', () => {
  /* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */

  describe('cron worker helpers', () => {
    let makeCronApiCall: (apiKey: string | undefined | null, baseUrl: string, endpoint: string, successMessage: string, body?: unknown) => Promise<void>;
    let normalizeValue: (value: unknown, fallback: string) => string;
    const originalFetch = global.fetch;

    beforeEach(async () => {
      jest.resetModules();
      global.fetch = jest.fn();
      const cronModule = require('../../cron.js');
      makeCronApiCall = cronModule.makeCronApiCall;
      normalizeValue = cronModule.normalizeValue;
    });

    afterEach(() => {
      if (originalFetch) {
        global.fetch = originalFetch;
      } else {
        // @ts-expect-error - allow cleaning up mock fetch
        delete global.fetch;
      }
      jest.restoreAllMocks();
    });

    it('skips API calls when the API key is missing', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await makeCronApiCall(undefined, 'http://localhost:3000', '/api/serp/refresh', 'ignored', { scope: 'enabled-domains' });

      expect(global.fetch).not.toHaveBeenCalled();
      // logger.warn emits a JSON log entry via console.log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"WARN"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping API call')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"/api/serp/refresh"')
      );
    });

    it('sends the authorization header when API key is available', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: () => Promise.resolve({ ok: true }),
      });

      await makeCronApiCall('secret', 'http://localhost:3000', '/api/serp/refresh', '[CRON] Keyword Scraping Result', { scope: 'enabled-domains' });

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/serp/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'enabled-domains' }),
      });
      // logger.info emits a JSON log entry via console.log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CRON] Keyword Scraping Result')
      );
    });

    it('logs an HTTP error response with its status and body without rejecting the caller', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'upstream unavailable',
      });

      await expect(makeCronApiCall('secret', 'http://localhost:3000', '/api/serp/refresh', 'unused', { scope: 'enabled-domains' })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 503: upstream unavailable'));
    });

    it('logs a successful empty non-JSON response without including a response body', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 204,
        headers: { get: jest.fn().mockReturnValue('text/plain') },
        text: async () => '',
      });

      await makeCronApiCall('secret', 'http://localhost:3000', '/api/app/email', 'email task completed');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('email task completed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"status":204'));
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('"response"'));
    });

    it('contains a rejected fetch and records which endpoint failed', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      (global.fetch as jest.Mock).mockRejectedValue(new Error('network unavailable'));

      await makeCronApiCall('secret', 'http://localhost:3000', '/api/google/searchconsole', 'unused');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error making API call'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/api/google/searchconsole'));
    });

    it('falls back when falsy non-string values are provided', () => {
      expect(normalizeValue(false, '0 0 0 * * *')).toBe('0 0 0 * * *');
      expect(normalizeValue(0, '0 0 0 * * *')).toBe('0 0 0 * * *');
      expect(normalizeValue('  "15:30"  ', '00:00')).toBe('15:30');
      expect(normalizeValue('   ', '00:00')).toBe('00:00');
    });
  });

  describe('getAppSettings', () => {
    const { promises: fsPromises } = require('fs');
    const defaultSettings = {
      scraper_type: 'none',
      notification_interval: 'never',
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: '',
      scrape_interval: '',
    };
    const originalCwd = process.cwd();
    let originalEnv: NodeJS.ProcessEnv;
    let workDir: string;
    let settingsPath: string;

    // getAppSettings reads `${process.cwd()}/data/settings.json`. Each case runs in its own temp working
    // directory so it never touches the real data/settings.json, which other Jest workers also read and write.
    beforeEach(async () => {
      originalEnv = { ...process.env };
      workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'serpbear-cron-settings-'));
      await fsPromises.mkdir(path.join(workDir, 'data'));
      settingsPath = path.join(workDir, 'data', 'settings.json');
      process.chdir(workDir);
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      process.env = { ...originalEnv };
      jest.unmock('cryptr');
      jest.resetModules();
      jest.restoreAllMocks();
      await fsPromises.rm(workDir, { recursive: true, force: true });
    });

    it('returns non-sensitive settings when decryption fails', async () => {
      const settingsPayload = {
        scraper_type: 'serpapi',
        notification_interval: 'daily',
        scraping_api: 'encrypted-value',
        smtp_password: 'encrypted-password',
      };
      await fsPromises.writeFile(settingsPath, JSON.stringify(settingsPayload), { encoding: 'utf-8' });

      jest.doMock('cryptr', () => jest.fn(() => {
        throw new Error('Missing secret');
      }));

      delete process.env.SECRET;
      const { getAppSettings } = require('../../cron.js');
      const settings = await getAppSettings();

      expect(settings).toEqual(expect.objectContaining({
        scraper_type: 'serpapi',
        notification_interval: 'daily',
        scraping_api: '',
        smtp_password: '',
      }));
    });

    it('returns defaults without overwriting invalid JSON settings', async () => {
      const invalidContent = '{not-json';
      await fsPromises.writeFile(settingsPath, invalidContent, { encoding: 'utf-8' });

      const writeSpy = jest.spyOn(fsPromises, 'writeFile');
      const { getAppSettings } = require('../../cron.js');
      const settings = await getAppSettings();
      const updatedContent = await fsPromises.readFile(settingsPath, { encoding: 'utf-8' });

      expect(settings).toEqual(defaultSettings);
      expect(updatedContent).toBe(invalidContent);
      expect(writeSpy).not.toHaveBeenCalled();
      writeSpy.mockRestore();
    });

    it('returns defaults without creating the settings file when it is missing (ENOENT)', async () => {
      const { getAppSettings } = require('../../cron.js');

      // The temp data/ directory starts empty, so settings.json does not exist yet
      await expect(fsPromises.access(settingsPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const settings = await getAppSettings();

      expect(settings).toEqual(defaultSettings);
      await expect(fsPromises.access(settingsPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('throws on invalid JSON in strict mode so the caller can keep its schedule', async () => {
      await fsPromises.writeFile(settingsPath, '{not-json', { encoding: 'utf-8' });
      const { getAppSettings } = require('../../cron.js');

      await expect(getAppSettings({ strict: true })).rejects.toThrow(SyntaxError);
    });

    it('logs a clear message when SECRET is not set', async () => {
      const original = process.env.SECRET;
      delete process.env.SECRET;
      await fsPromises.writeFile(settingsPath, JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'x' }), { encoding: 'utf-8' });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const { getAppSettings } = require('../../cron.js');

      const settings = await getAppSettings();

      expect(settings).toMatchObject({ scraper_type: 'serpapi', scraping_api: '', smtp_password: '' });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SECRET is not set'));
      consoleSpy.mockRestore();
      if (original !== undefined) { process.env.SECRET = original; }
    });

    it('runs the other_day schedule on odd days with no gap longer than 2 days', () => {
      const { Cron } = require('croner');
      const { CRON_INTERVAL_MAP } = require('../../cron.js');
      const runs = new Cron(CRON_INTERVAL_MAP.other_day, { timezone: 'UTC' }).nextRuns(200, new Date('2027-01-01T00:00:00Z')) as Date[];
      for (let i = 1; i < runs.length; i += 1) {
        const gapDays = Math.round((runs[i].getTime() - runs[i - 1].getTime()) / 86400000);
        expect(gapDays).toBeLessThanOrEqual(2);
      }
      expect(runs.some((run) => run.getUTCDate() === 31)).toBe(true);

      // Every interval runs at the CRON_MAIN_SCHEDULE time, the digests at the CRON_EMAIL_SCHEDULE time.
      // A value that is not HH:MM falls back to the default.
      const saved = { main: process.env.CRON_MAIN_SCHEDULE, email: process.env.CRON_EMAIL_SCHEDULE };
      process.env.CRON_MAIN_SCHEDULE = '02:30';
      process.env.CRON_EMAIL_SCHEDULE = '0 0 6 * * *';
      jest.resetModules();
      jest.spyOn(console, 'log').mockImplementation();
      const timed = require('../../cron.js');
      expect(timed.CRON_INTERVAL_MAP).toMatchObject({
        daily: '0 30 2 * * *', other_day: '0 30 2 1-31/2 * *', weekly: '0 30 2 * * 1', monthly: '0 30 2 1 * *',
      });
      expect(timed.NOTIFICATION_SCHEDULE_MAP).toMatchObject({ daily: '0 0 6 * * *', weekly: '0 0 6 * * 1', monthly: '0 0 6 1 * *' });
      Object.entries(saved).forEach(([key, value]) => {
        const name = key === 'main' ? 'CRON_MAIN_SCHEDULE' : 'CRON_EMAIL_SCHEDULE';
        if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; }
      });
    });
  });

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
      ({ loadEnvFiles } = require('../../cron.js'));
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

    it('loads variables from .env', () => {
      writeFileSync(path.join(dir, '.env'), 'CRON_ENV_TEST_SHARED=env-file\nCRON_ENV_TEST_ONLY=from-env\n');

      loadEnvFiles(dir);

      expect(process.env.CRON_ENV_TEST_SHARED).toBe('env-file');
      expect(process.env.CRON_ENV_TEST_ONLY).toBe('from-env');
    });

    it('keeps variables already in the process environment (for example from docker compose)', () => {
      process.env.CRON_ENV_TEST_SHELL = 'from-shell';
      writeFileSync(path.join(dir, '.env'), 'CRON_ENV_TEST_SHELL=from-env\n');

      loadEnvFiles(dir);

      expect(process.env.CRON_ENV_TEST_SHELL).toBe('from-shell');
    });

    it('does not fail when .env does not exist', () => {
      expect(() => loadEnvFiles(dir)).not.toThrow();
    });
  });
});
