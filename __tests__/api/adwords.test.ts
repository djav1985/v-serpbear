import { readFile } from 'fs/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import db from '../../database/database';
import handler from '../../pages/api/adwords';
import verifyUser from '../../utils/verifyUser';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';

type MutableEnv = typeof process.env & {
   SECRET?: string;
};

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: { sync: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
   __esModule: true,
   default: jest.fn(),
}));

jest.mock('fs/promises', () => ({
   readFile: jest.fn(),
   writeFile: jest.fn(),
}));

const decryptMock = jest.fn();
const encryptMock = jest.fn();

jest.mock('cryptr', () => ({
   __esModule: true,
   default: jest.fn().mockImplementation(() => ({
      decrypt: decryptMock,
      encrypt: encryptMock,
   })),
}));

jest.mock('../../utils/adwords', () => ({
   __esModule: true,
   getAdwordsCredentials: jest.fn(),
   getAdwordsKeywordIdeas: jest.fn(),
}));

describe('GET /api/adwords - refresh token retrieval', () => {
   const originalEnv = process.env;
   const originalFetch = global.fetch;
   const fetchMock = jest.fn();

   beforeEach(() => {
      (process.env as MutableEnv) = { ...originalEnv, SECRET: 'secret' };
      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (readFile as jest.Mock).mockResolvedValue(
         '{"adwords_client_id":"encrypted-client-id","adwords_client_secret":"encrypted-client-secret"}',
      );
      decryptMock.mockImplementationOnce(() => 'client-id').mockImplementationOnce(() => 'client-secret');
      encryptMock.mockImplementation((value: string) => value);
      fetchMock.mockResolvedValue({
         ok: false,
         json: jest.fn().mockResolvedValue({}),
         text: jest.fn().mockResolvedValue(''),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
   });

   afterEach(() => {
      jest.clearAllMocks();
      process.env = originalEnv;
      global.fetch = originalFetch;
   });

   it('logs a default error message when the Google API response lacks an error string', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      const req = {
         method: 'GET',
         query: { code: 'auth-code' },
         headers: { host: 'localhost:3000' },
      } as unknown as NextApiRequest;

      const res = {
         status: jest.fn().mockReturnThis(),
         setHeader: jest.fn().mockReturnThis(),
         send: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(db.sync).toHaveBeenCalled();
      expect(verifyUser).toHaveBeenCalledWith(req, res);
      expect(readFile).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
         'https://oauth2.googleapis.com/token',
         expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
         }),
      );
      const [, options] = fetchMock.mock.calls[0] as [string, { body: URLSearchParams }];
      expect(String(options.body)).toContain('code=auth-code');
      expect(String(options.body)).toContain(
         `redirect_uri=${encodeURIComponent('http://localhost:3000/api/adwords')}`,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('adwordsIntegrated'));
      expect(logSpy).toHaveBeenCalledWith(
         '[Error] Getting Google Ads Refresh Token! Reason: ',
         'Error Getting the Google Ads Refresh Token. Please Try Again!',
      );

      logSpy.mockRestore();
   });
});

describe('POST /api/adwords - validate integration', () => {
   const originalEnv = process.env;

   beforeEach(() => {
      (process.env as MutableEnv) = { ...originalEnv, SECRET: 'secret' };
      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (readFile as jest.Mock).mockResolvedValue('{}');
      encryptMock.mockImplementation((value: string) => value);
      (getAdwordsCredentials as jest.Mock).mockResolvedValue({
         client_id: 'client',
         client_secret: 'secret',
         refresh_token: 'token',
         developer_token: 'dev',
         account_id: '123',
      });
      (getAdwordsKeywordIdeas as jest.Mock).mockResolvedValue([]);
   });

   afterEach(() => {
      jest.clearAllMocks();
      process.env = originalEnv;
   });

   it('accepts integrations even when Google Ads returns zero keyword ideas', async () => {
      const req = {
         method: 'POST',
         body: { developer_token: 'dev', account_id: '123-456-7890' },
         headers: { host: 'localhost:3000' },
      } as unknown as NextApiRequest;

      const res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ valid: true });
   });
});
