import { writeFile, readFile, rename, unlink } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/settings';
import * as settingsApi from '../../pages/api/settings';
import clearFailedHandler from '../../pages/api/clearfailed';
import { getBranding } from '../../utils/branding';
import { createMockResponse } from '../__helpers__';

const { platformName } = getBranding();
import verifyUser from '../../utils/verifyUser';

jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../scrapers/index', () => ({
  __esModule: true,
  default: [],
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
}));

// Mock retryQueueManager (clearQueue is used by the merged /api/clearfailed suite below)
jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    peekQueue: jest.fn().mockResolvedValue([]),
    clearQueue: jest.fn(),
  },
}));

// Mock the logger to prevent console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
}));

// Mock the API logging middleware
jest.mock('../../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));

const encryptMock = jest.fn((value: string) => value);
const readFileMock = readFile as unknown as jest.Mock;
const verifyUserMock = verifyUser as unknown as jest.Mock;
const writeFileMock = writeFile as unknown as jest.Mock;
const renameMock = rename as unknown as jest.Mock;
const _unlinkMock = unlink as unknown as jest.Mock;
const originalEnv = process.env;

jest.mock('cryptr', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    encrypt: encryptMock,
  })),
}));

describe('PUT /api/settings validation and errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SECRET: 'secret' };
    verifyUserMock.mockReturnValue('authorized');
    encryptMock.mockClear();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 400 when settings payload is missing', async () => {
    const req = {
      method: 'PUT',
      body: {},
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    // GET no longer calls verifyUser (uses silent auth check to avoid logging anonymous access failures)
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST', message: 'Settings payload is required.' }) }),
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('returns 500 with non-nested details when persisting encrypted settings fails', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'));

    const req = {
      method: 'PUT',
      body: { settings: { scraping_api: 'value', smtp_password: 'password' } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(writeFileMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(jsonCall.error.message).toBe('Failed to update settings.');
    expect(jsonCall.error.details).toBe('disk full');
    expect(jsonCall.error.details).not.toEqual(expect.objectContaining({ details: expect.anything() }));
  });

  it('returns 400 and does not save when a field has an invalid value', async () => {
    const req = {
      method: 'PUT',
      body: { settings: { scrape_strategy: 'everything' } },
      headers: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_REQUEST', message: expect.stringContaining('scrape_strategy') }) }),
    );
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});

describe('validateSettingsPayload', () => {
  const { validateSettingsPayload } = settingsApi;

  it('accepts a valid payload', () => {
    expect(validateSettingsPayload({
      scraper_type: 'none',
      scrape_strategy: 'custom',
      scrape_pagination_limit: 5,
      notification_interval: 'weekly',
      scrape_retry: true,
      smtp_port: '587',
      notification_email: 'me@example.com',
      keywordsColumns: ['Best', 'Volume'],
    })).toEqual([]);
  });

  it('accepts empty optional values', () => {
    expect(validateSettingsPayload({ smtp_port: '', notification_email: '' })).toEqual([]);
  });

  it.each([
    ['scraper_type', 'made-up', /Unknown scraper type/],
    ['scrape_strategy', 'everything', /scrape_strategy/],
    ['notification_interval', 'hourly', /notification_interval/],
  ])('rejects an unknown %s value', (field, value, message) => {
    expect(validateSettingsPayload({ [field]: value })[0]).toMatch(message);
  });

  it.each([0, 11, 2.5, 'abc'])('rejects pagination limit %p', (limit) => {
    expect(validateSettingsPayload({ scrape_pagination_limit: limit })[0]).toMatch(/scrape_pagination_limit/);
  });

  it('rejects non-boolean flags', () => {
    expect(validateSettingsPayload({ scrape_retry: 'yes' })[0]).toMatch(/scrape_retry must be true or false/);
  });

  it('rejects a port outside 1-65535', () => {
    expect(validateSettingsPayload({ smtp_port: '70000' })[0]).toMatch(/smtp_port/);
  });

  it.each(['not-an-email', 'user@localhost'])('rejects malformed notification email %s', (email) => {
    expect(validateSettingsPayload({ notification_email: email })[0]).toMatch(/notification_email/);
  });

  it('rejects a dotted domain with many repeated dots quickly', () => {
    const hostile = `a@${'.'.repeat(5000)}`;
    const started = Date.now();
    const errors = validateSettingsPayload({ notification_email: hostile });
    expect(Date.now() - started).toBeLessThan(200);
    expect(errors[0]).toMatch(/notification_email/);
  });

  it('rejects keywordsColumns that are not a list of strings', () => {
    expect(validateSettingsPayload({ keywordsColumns: 'Best' })[0]).toMatch(/keywordsColumns/);
  });
});

describe('GET /api/settings and configuration requirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SECRET: 'secret' };
    verifyUserMock.mockReturnValue('authorized');
    encryptMock.mockClear();
    readFileMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns settings when loading settings succeeds', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const req = {
      method: 'GET',
      headers: {},
      query: {},
    } as unknown as NextApiRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    // GET no longer calls verifyUser (uses silent auth check to avoid logging anonymous access failures)
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        version: '4.0.0',
      }),
    });
  });

  it('returns settings successfully', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const settings = await settingsApi.getAppSettings();

    expect(settings).toMatchObject({
      scraper_type: 'none',
      scraping_api: '',
      notification_interval: 'never',
      notification_email: '',
      notification_email_from: '',
      notification_email_from_name: platformName,
      smtp_server: '',
      smtp_port: '',
      smtp_username: '',
      smtp_password: '',
      scrape_interval: '',
      scrape_delay: '',
      scrape_retry: false,
      search_console: true,
      search_console_client_email: '',
      search_console_private_key: '',
      search_console_integrated: false,
      adwords_client_id: '',
      adwords_client_secret: '',
      adwords_refresh_token: '',
      adwords_developer_token: '',
      adwords_account_id: '',
      keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
      available_scapers: [],
      failed_queue: [],
    });
  });

  it('normalizes removed global scraper selections and drops proxy settings', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      scraper_type: 'proxy',
      proxy: 'http://legacy-proxy',
      notification_interval: 'weekly',
    }));

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraper_type).toBe('none');
    expect(settings.notification_interval).toBe('weekly');
    expect(settings).not.toHaveProperty('proxy');
  });

  it('returns defaults without logging an error when settings.json is missing', async () => {
    const missingSettingsError = Object.assign(new Error('missing settings'), { code: 'ENOENT' });
    const { logger } = require('../../utils/logger');

    readFileMock.mockRejectedValueOnce(missingSettingsError);
    writeFileMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings).toEqual(expect.objectContaining({
      scraper_type: 'none',
      available_scapers: expect.any(Array),
    }));
    expect(logger.error).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('treats an empty or whitespace-only settings.json as no stored settings', async () => {
    const { logger } = require('../../utils/logger');
    for (const contents of ['', ' \n\t ']) {
      readFileMock.mockResolvedValueOnce(contents);

      const settings = await settingsApi.getAppSettings();

      expect(settings.scraper_type).toBe('none');
      expect(settings.keywordsColumns).toEqual(['Best', 'History', 'Volume', 'Search Console']);
    }
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('does not overwrite settings when JSON is invalid', async () => {
    readFileMock
      .mockResolvedValueOnce('{bad json')
      .mockResolvedValueOnce(JSON.stringify([]));
    writeFileMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraper_type).toBe('none');
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('returns failed_queue from retryQueueManager', async () => {
    const settingsPayload = JSON.stringify({ scraper_type: 'serpapi' });
    const mockQueue = [123, 456, 789];

    readFileMock.mockResolvedValueOnce(settingsPayload);
    
    const { retryQueueManager } = require('../../utils/retryQueueManager');
    retryQueueManager.peekQueue.mockResolvedValueOnce(mockQueue);

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraper_type).toBe('serpapi');
    expect(settings.failed_queue).toEqual(mockQueue);
    expect(retryQueueManager.peekQueue).toHaveBeenCalled();
  });

  it('blanks all sensitive fields when decryption fails', async () => {
    // Provide settings with values that look like encrypted blobs
    const encryptedPayload = JSON.stringify({
      scraper_type: 'serpapi',
      scraping_api: 'encrypted-blob',
      smtp_password: 'encrypted-smtp',
      search_console_client_email: 'encrypted-email',
      search_console_private_key: 'encrypted-key',
      adwords_client_id: 'encrypted-client-id',
      adwords_client_secret: 'encrypted-client-secret',
      adwords_refresh_token: 'encrypted-refresh',
      adwords_developer_token: 'encrypted-dev-token',
      adwords_account_id: 'encrypted-account-id',
    });

    readFileMock.mockResolvedValueOnce(encryptedPayload);

    // Make Cryptr's decrypt throw to simulate a bad SECRET / corrupted ciphertext
    const Cryptr = require('cryptr').default;
    (Cryptr as jest.Mock).mockImplementationOnce(() => ({
      decrypt: () => { throw new Error('invalid ciphertext'); },
    }));

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraping_api).toBe('');
    expect(settings.smtp_password).toBe('');
    expect(settings.search_console_client_email).toBe('');
    expect(settings.search_console_private_key).toBe('');
    expect(settings.adwords_client_id).toBe('');
    expect(settings.adwords_client_secret).toBe('');
    expect(settings.adwords_refresh_token).toBe('');
    expect(settings.adwords_developer_token).toBe('');
    expect(settings.adwords_account_id).toBe('');
    // Non-sensitive fields should still be present
    expect(settings.scraper_type).toBe('serpapi');
  });
});

describe('/api/clearfailed', () => {
   const req = { method: 'PUT', headers: {} } as unknown as NextApiRequest;
   let res: NextApiResponse;

   beforeEach(() => {
      res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;

      (verifyUser as jest.Mock).mockReturnValue('authorized');
      const { retryQueueManager } = require('../../utils/retryQueueManager');
      (retryQueueManager.clearQueue as jest.Mock).mockResolvedValue(undefined);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('responds with error status when clearing the queue fails', async () => {
      const { retryQueueManager } = require('../../utils/retryQueueManager');
      (retryQueueManager.clearQueue as jest.Mock).mockRejectedValue(new Error('disk full'));

      await clearFailedHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
         expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', message: 'disk full' }) }),
      );
   });
});

// Suites below need mocks that differ from the ones above (real Cryptr, atomicWrite/settingsFile, a
// cookies-aware verifyUser), so they load the handler in an isolated module registry.
describe('PUT /api/settings keeps secrets that are left out of the payload', () => {
  const originalSecret = process.env.SECRET;
  const mockStoredFile = { current: '{}' };
  let handler: any;
  let verifyUserInstance: jest.Mock;
  let writeMock: jest.Mock;
  let cryptr: any;
  let storedApiKey: string;
  let storedSmtpPassword: string;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('fs/promises', () => ({
      __esModule: true,
      readFile: jest.fn(async () => mockStoredFile.current),
      writeFile: jest.fn(),
      access: jest.fn(),
      rename: jest.fn(),
      unlink: jest.fn(),
    }));
    jest.doMock('cryptr', () => jest.requireActual('cryptr'));
    jest.doMock('../../scrapers/index', () => jest.requireActual('../../scrapers/index'));
    jest.doMock('../../utils/atomicWrite', () => ({
      __esModule: true,
      atomicWriteFile: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../utils/settingsFile', () => ({ withSettingsLock: (section: () => Promise<unknown>) => section() }));
    jest.isolateModules(() => {
      handler = require('../../pages/api/settings').default;
      verifyUserInstance = require('../../utils/verifyUser').default;
      writeMock = require('../../utils/atomicWrite').atomicWriteFile;
    });
    const RealCryptr = jest.requireActual('cryptr');
    cryptr = new RealCryptr('keep-secrets-test-secret');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'keep-secrets-test-secret';
    verifyUserInstance.mockReturnValue('authorized');
    storedApiKey = cryptr.encrypt('stored-scraper-key');
    storedSmtpPassword = cryptr.encrypt('stored-smtp-password');
    mockStoredFile.current = JSON.stringify({
      scraper_type: 'serper',
      scraping_api: storedApiKey,
      smtp_password: storedSmtpPassword,
      adwords_refresh_token: cryptr.encrypt('stored-refresh-token'),
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
  });

  it('keeps the stored encrypted secrets when the payload does not include them', async () => {
    const req = { method: 'PUT', body: { settings: { scraper_type: 'serper', notification_interval: 'never' } }, headers: {} } as unknown as NextApiRequest;
    const res = createMockResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    const saved = JSON.parse(writeMock.mock.calls[0][1]);
    expect(saved.scraping_api).toBe(storedApiKey);
    expect(saved.smtp_password).toBe(storedSmtpPassword);
    expect(cryptr.decrypt(saved.adwords_refresh_token)).toBe('stored-refresh-token');
  });

  it('does not persist the derived fields that GET adds to the settings', async () => {
    const payload = { scraper_type: 'serper', version: '9.9.9', timezone: 'UTC', available_scapers: [{ id: 'x' }], search_console_integrated: true, failed_queue: [1] };
    const req = { method: 'PUT', body: { settings: payload }, headers: {} } as unknown as NextApiRequest;
    const res = createMockResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    const saved = JSON.parse(writeMock.mock.calls[0][1]);
    expect(saved.scraper_type).toBe('serper');
    ['version', 'timezone', 'available_scapers', 'search_console_integrated', 'failed_queue'].forEach((field) => {
      expect(saved).not.toHaveProperty(field);
    });
  });

  it('replaces a secret when the payload sends a new value, and clears it when the value is empty', async () => {
    const req = { method: 'PUT', body: { settings: { scraper_type: 'serper', scraping_api: 'new-key', smtp_password: '' } }, headers: {} } as unknown as NextApiRequest;
    const res = createMockResponse();

    await handler(req, res as unknown as NextApiResponse);

    const saved = JSON.parse(writeMock.mock.calls[0][1]);
    expect(cryptr.decrypt(saved.scraping_api)).toBe('new-key');
    expect(saved.smtp_password).toBe('');
  });
});

describe('GET /api/settings session checks', () => {
  const originalSecret = process.env.SECRET;
  let handler: any;
  let verifySessionMock: jest.Mock;
  let readFileMock: jest.Mock;
  let CookiesMock: jest.Mock;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('cookies', () => jest.fn());
    jest.doMock('../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
      verifySessionToken: jest.fn(),
    }));
    jest.doMock('fs/promises', () => ({
      readFile: jest.fn(),
      writeFile: jest.fn(),
      access: jest.fn(),
      rename: jest.fn(),
      unlink: jest.fn(),
    }));
    jest.doMock('../../utils/retryQueueManager', () => ({
      retryQueueManager: { peekQueue: jest.fn().mockResolvedValue([]) },
    }));
    jest.isolateModules(() => {
      handler = require('../../pages/api/settings').default;
      verifySessionMock = require('../../utils/verifyUser').verifySessionToken;
      readFileMock = require('fs/promises').readFile;
      CookiesMock = require('cookies');
    });
  });

  const run = async () => {
    const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);
    return (res.json as jest.Mock).mock.calls[0][0].settings;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'secret';
    CookiesMock.mockImplementation(() => ({ get: () => 'copied-token' }));
    readFileMock.mockResolvedValue(JSON.stringify({ smtp_password: 'hunter2', scraping_api: 'key' }));
  });

  afterEach(() => {
    if (originalSecret === undefined) { delete process.env.SECRET; } else { process.env.SECRET = originalSecret; }
  });

  it('returns only public settings when the token was revoked by logout', async () => {
    verifySessionMock.mockImplementation(() => { throw new Error('Session has been revoked'); });

    const settings = await run();

    expect(settings).toEqual({
      scraper_type: expect.any(String),
      available_scapers: expect.any(Array),
      search_console_integrated: expect.any(Boolean),
      timezone: expect.any(String),
      version: expect.any(String),
    });
    expect(settings.smtp_password).toBeUndefined();
  });

  it('returns full settings for a valid, current session', async () => {
    verifySessionMock.mockReturnValue({ user: 'admin' });

    const settings = await run();

    expect(verifySessionMock).toHaveBeenCalledWith('copied-token');
    expect(settings.smtp_password).toBeDefined();
  });
});
