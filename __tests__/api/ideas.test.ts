export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import { readFile, writeFile } from 'fs/promises';
import db from '../../database/database';
import handler from '../../pages/api/ideas';
import verifyUser from '../../utils/verifyUser';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';
import type { KeywordIdeasDatabase } from '../../utils/adwords';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));

// The local keyword store (getLocalKeywordIdeas / updateLocalKeywordIdeas) runs for real so the
// favorites test can assert what is persisted; only the Google Ads calls are stubbed.
jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  ...jest.requireActual('../../utils/adwords'),
  getAdwordsCredentials: jest.fn(),
  getAdwordsKeywordIdeas: jest.fn(),
  // The file lock needs a real file on disk; the test only checks the read-modify-write itself
  withIdeasLock: (_domain: string, fn: () => Promise<unknown>) => fn(),
}));

// Writes go through atomicWriteFile; route them to the mocked writeFile so the assertions still see the contents
jest.mock('../../utils/atomicWrite', () => ({
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- forwards the temp path the route computed in tests
  atomicWriteFile: (filePath: string, data: string, encoding: string) => require('fs/promises').writeFile(filePath, data, encoding),
}));

jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => true),
  },
}));

const valid = { keywords: ['shoes'], country: 'US', language: '1000', domainUrl: 'example.com', domainSlug: 'example-com', seedType: 'custom' };

const post = async (body: Record<string, unknown>) => {
  const req = createMockRequest({ method: 'POST', body });
  const res = createMockResponse();
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

describe('POST /api/ideas input validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    (getAdwordsCredentials as jest.Mock).mockResolvedValue({ client_id: 'a', client_secret: 'b', developer_token: 'c', account_id: 'd', refresh_token: 'e' });
    (getAdwordsKeywordIdeas as jest.Mock).mockResolvedValue([{ uid: 'us:shoes', keyword: 'shoes' }]);
  });

  it.each([
    ['a domain slug that could leave the data folder', { domainSlug: '../../etc/passwd' }],
    ['a domain slug that is not a string', { domainSlug: ['a'] }],
    ['a country that is not a two-letter code', { country: 'USA' }],
    ['a language that is not a numeric ID', { language: 'english' }],
    ['keywords that are not strings', { keywords: [{ a: 1 }] }],
    ['a domainUrl that is not a string', { domainUrl: { a: 1 } }],
  ])('returns 400 for %s, before calling Google Ads', async (_label, override) => {
    const res = await post({ ...valid, ...override });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getAdwordsKeywordIdeas).not.toHaveBeenCalled();
  });

  it('accepts a valid request', async () => {
    const res = await post(valid);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(getAdwordsKeywordIdeas).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/ideas favorites persistence', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (writeFile as jest.Mock).mockResolvedValue(undefined);
   });

   it('persists an empty favorites array after toggling off a keyword', async () => {
      const keyword = { uid: 'kw-1', keyword: 'test keyword' } as any;
      const storedDatabase = {
         keywords: [keyword],
         favorites: [keyword],
         settings: { seedType: 'custom' },
         updated: Date.now(),
      } as KeywordIdeasDatabase;

      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(storedDatabase));

      const req = {
         method: 'PUT',
         body: { keywordID: 'kw-1', domain: 'example-com' },
         headers: {},
         connection: {},
      } as unknown as NextApiRequest;

      const res = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ keywords: [], error: '' });
      expect(writeFile).toHaveBeenCalledTimes(1);

      const [, contents] = (writeFile as jest.Mock).mock.calls[0];
      const saved = JSON.parse(contents as string) as KeywordIdeasDatabase;
      expect(saved.favorites).toEqual([]);
   });
});
