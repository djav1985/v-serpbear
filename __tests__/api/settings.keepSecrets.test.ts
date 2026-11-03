/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import handler from '../../pages/api/settings';
import verifyUser from '../../utils/verifyUser';
import { atomicWriteFile } from '../../utils/atomicWrite';
import { createMockResponse } from '../__helpers__';

const storedFile = { current: '{}' };

jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(async () => storedFile.current),
  access: jest.fn(),
}));

jest.mock('../../utils/atomicWrite', () => ({
  __esModule: true,
  atomicWriteFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/settingsFile', () => ({ withSettingsLock: (section: () => Promise<unknown>) => section() }));

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (apiHandler: any) => apiHandler }));
jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { peekQueue: jest.fn().mockResolvedValue([]) },
}));

const writeMock = atomicWriteFile as unknown as jest.Mock;
const cryptr = new Cryptr('keep-secrets-test-secret');

describe('PUT /api/settings keeps secrets that are left out of the payload', () => {
  const originalSecret = process.env.SECRET;
  const storedApiKey = cryptr.encrypt('stored-scraper-key');
  const storedSmtpPassword = cryptr.encrypt('stored-smtp-password');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'keep-secrets-test-secret';
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    storedFile.current = JSON.stringify({
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

  it('replaces a secret when the payload sends a new value, and clears it when the value is empty', async () => {
    const req = { method: 'PUT', body: { settings: { scraper_type: 'serper', scraping_api: 'new-key', smtp_password: '' } }, headers: {} } as unknown as NextApiRequest;
    const res = createMockResponse();

    await handler(req, res as unknown as NextApiResponse);

    const saved = JSON.parse(writeMock.mock.calls[0][1]);
    expect(cryptr.decrypt(saved.scraping_api)).toBe('new-key');
    expect(saved.smtp_password).toBe('');
  });
});
