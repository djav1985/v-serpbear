import { writeFile, readFile, access, rename, unlink } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/settings';
import * as settingsApi from '../../pages/api/settings';
import { getBranding } from '../../utils/branding';

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
const accessMock = access as unknown as jest.Mock;
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

    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Settings payload is required.' });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('returns 500 when persisting encrypted settings fails', async () => {
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
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update settings.', details: 'disk full' });
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

    expect(verifyUserMock).toHaveBeenCalledWith(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        version: '3.0.0',
      }),
    });
  });

  it('returns settings with version from package.json', async () => {
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

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        version: '3.0.0',
      }),
    });
  });

  it('returns settings successfully', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({})).mockResolvedValueOnce(JSON.stringify([]));

    const settings = await settingsApi.getAppSettings();

    expect(settings).toMatchObject({
      scraper_type: 'none',
      scraping_api: '',
      proxy: '',
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

  it('returns defaults when files are missing', async () => {
    const missingSettingsError = Object.assign(new Error('missing settings'), { code: 'ENOENT' });
    const missingQueueError = Object.assign(new Error('missing failed queue'), { code: 'ENOENT' });

    readFileMock
      .mockRejectedValueOnce(missingSettingsError)
      .mockRejectedValueOnce(missingQueueError);
    accessMock
      .mockRejectedValueOnce(missingSettingsError)
      .mockRejectedValueOnce(missingQueueError);
    writeFileMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings).toEqual(expect.objectContaining({
      scraper_type: 'none',
      available_scapers: expect.any(Array),
    }));
    // Check that write happened (via atomicWriteFile which calls writeFile then rename)
    expect(writeFileMock).toHaveBeenCalled();
    expect(renameMock).toHaveBeenCalled();
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

  it('recreates failed queue without overwriting settings', async () => {
    const settingsPayload = JSON.stringify({ scraper_type: 'serpapi' });
    const missingQueueError = Object.assign(new Error('missing failed queue'), { code: 'ENOENT' });

    readFileMock
      .mockResolvedValueOnce(settingsPayload)
      .mockRejectedValueOnce(missingQueueError);

    writeFileMock.mockResolvedValue(undefined);
    renameMock.mockResolvedValue(undefined);

    const settings = await settingsApi.getAppSettings();

    expect(settings.scraper_type).toBe('serpapi');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    // atomicWriteFile writes to temp file with { encoding } object
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('failed_queue.json.tmp'),
      JSON.stringify([]),
      { encoding: 'utf-8' },
    );
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringContaining('failed_queue.json.tmp'),
      expect.stringContaining('failed_queue.json'),
    );
  });
});
