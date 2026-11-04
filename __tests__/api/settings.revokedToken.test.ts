export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import Cookies from 'cookies';
import { readFile } from 'fs/promises';
import handler from '../../pages/api/settings';
import { verifySessionToken } from '../../utils/verifyUser';

jest.mock('cookies');
jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
  verifySessionToken: jest.fn(),
}));
jest.mock('../../scrapers/index', () => ({ __esModule: true, default: [] }));
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
}));
jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: { getQueue: jest.fn().mockResolvedValue([]), peekQueue: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), verbose: jest.fn(), isSuccessLoggingEnabled: jest.fn(() => true) },
}));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));

const verifySessionMock = verifySessionToken as unknown as jest.Mock;
const readFileMock = readFile as unknown as jest.Mock;

const run = async () => {
  const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
  await handler(req, res);
  return (res.json as jest.Mock).mock.calls[0][0].settings;
};

describe('GET /api/settings session checks', () => {
  const originalSecret = process.env.SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'secret';
    (Cookies as unknown as jest.Mock).mockImplementation(() => ({ get: () => 'copied-token' }));
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
