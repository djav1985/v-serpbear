describe('cron worker helpers', () => {
  let makeCronApiCall: (apiKey: string | undefined | null, baseUrl: string, endpoint: string, successMessage: string) => Promise<void>;
  let normalizeCronExpression: (value: unknown, fallback: string) => string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.resetModules();
    global.fetch = jest.fn();
    const cronModule = require('../cron.js');
    makeCronApiCall = cronModule.makeCronApiCall;
    normalizeCronExpression = cronModule.normalizeCronExpression;
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
    expect(consoleSpy).toHaveBeenCalledWith('[CRON] Skipping API call to /api/cron: API key not configured.');
  });

  it('sends the authorization header when API key is available', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    (global.fetch as jest.Mock).mockResolvedValue({ 
      ok: true,
      headers: {
        get: jest.fn().mockReturnValue('application/json'),
      },
      json: () => Promise.resolve({ ok: true }),
    });

    await makeCronApiCall('secret', 'http://localhost:3000', '/api/cron', 'Success:');

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/cron', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(consoleSpy).toHaveBeenCalledWith('Success:', { data: { ok: true } });
  });

  it('falls back when falsy non-string values are provided', () => {
    expect(normalizeCronExpression(false, '0 0 0 * * *')).toBe('0 0 0 * * *');
    expect(normalizeCronExpression(0, '0 0 0 * * *')).toBe('0 0 0 * * *');
  });
});

describe('getAppSettings', () => {
  const { promises: fsPromises } = require('fs');
  const settingsPath = `${process.cwd()}/data/settings.json`;
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
  let originalSettingsContent = '';
  const originalSecret = process.env.SECRET;

  beforeAll(async () => {
    originalSettingsContent = await fsPromises.readFile(settingsPath, { encoding: 'utf-8' });
  });

  afterEach(async () => {
    process.env.SECRET = originalSecret;
    jest.unmock('cryptr');
    jest.resetModules();
    jest.restoreAllMocks();
    await fsPromises.writeFile(settingsPath, originalSettingsContent, { encoding: 'utf-8' });
  });

  afterAll(() => {
    process.env.SECRET = originalSecret;
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

    // @ts-expect-error - test case for missing secret
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
    const { unlink } = require('fs/promises');
    const { getAppSettings } = require('../cron.js');
    
    // Ensure file doesn't exist
    try {
      await unlink(settingsPath);
    } catch (_error) {
      // File may already not exist, which is fine
    }

    const settings = await getAppSettings();
    const createdContent = await fsPromises.readFile(settingsPath, { encoding: 'utf-8' });
    const createdSettings = JSON.parse(createdContent);

    expect(settings).toEqual(defaultSettings);
    expect(createdSettings).toEqual(defaultSettings);
  });
});
