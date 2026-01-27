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
    (global.fetch as jest.Mock).mockResolvedValue({ json: () => Promise.resolve({ ok: true }) });

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
