/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
export {};
describe('cron worker helpers', () => {
  let makeCronApiCall: (apiKey: string | undefined | null, baseUrl: string, endpoint: string, successMessage: string) => Promise<void>;
  let normalizeValue: (value: unknown, fallback: string) => string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.resetModules();
    global.fetch = jest.fn();
    const cronModule = require('../cron.js');
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

    await makeCronApiCall(undefined, 'http://localhost:3000', '/api/cron', 'ignored');

    expect(global.fetch).not.toHaveBeenCalled();
    // logger.warn emits a JSON log entry via console.log
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"WARN"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping API call')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"/api/cron"')
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

    await makeCronApiCall('secret', 'http://localhost:3000', '/api/cron', 'CRON: Keyword Scraping Result');

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/cron', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
    });
    // logger.info emits a JSON log entry via console.log
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"level":"INFO"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRON: Keyword Scraping Result')
    );
  });

  it('falls back when falsy non-string values are provided', () => {
    expect(normalizeValue(false, '0 0 0 * * *')).toBe('0 0 0 * * *');
    expect(normalizeValue(0, '0 0 0 * * *')).toBe('0 0 0 * * *');
  });
});

describe('getAppSettings', () => {
  const { promises: fsPromises } = require('fs');
  const os = require('os');
  const path = require('path');
  const defaultSettings = {
    scraper_type: 'none',
    notification_interval: 'never',
    notification_email: '',
    smtp_server: '',
    smtp_port: '',
    smtp_username: '',
    smtp_password: '',
    scrape_interval: '',
  };
  const originalCwd = process.cwd();
  const originalSecret = process.env.SECRET;
  let workDir: string;
  let settingsPath: string;

  // getAppSettings reads `${process.cwd()}/data/settings.json`. Each case runs in its own temp working
  // directory so it never touches the real data/settings.json, which other Jest workers also read and write.
  beforeEach(async () => {
    workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'serpbear-cron-settings-'));
    await fsPromises.mkdir(path.join(workDir, 'data'));
    settingsPath = path.join(workDir, 'data', 'settings.json');
    process.chdir(workDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
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
    const { getAppSettings } = require('../cron.js');
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
    const { getAppSettings } = require('../cron.js');
    const settings = await getAppSettings();
    const updatedContent = await fsPromises.readFile(settingsPath, { encoding: 'utf-8' });

    expect(settings).toEqual(defaultSettings);
    expect(updatedContent).toBe(invalidContent);
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it('creates settings file with defaults when file is missing (ENOENT)', async () => {
    const { getAppSettings } = require('../cron.js');

    // The temp data/ directory starts empty, so settings.json does not exist yet
    await expect(fsPromises.access(settingsPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const settings = await getAppSettings();
    const createdContent = await fsPromises.readFile(settingsPath, { encoding: 'utf-8' });
    const createdSettings = JSON.parse(createdContent);

    expect(settings).toEqual(defaultSettings);
    expect(createdSettings).toEqual(defaultSettings);
  });
});
