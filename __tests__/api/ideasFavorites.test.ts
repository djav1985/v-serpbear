import type { NextApiRequest, NextApiResponse } from 'next';
import { readFile, writeFile } from 'fs/promises';
import db from '../../database/database';
import handler from '../../pages/api/ideas';
import verifyUser from '../../utils/verifyUser';
import type { KeywordIdeasDatabase } from '../../utils/adwords';

jest.mock('../../database/database', () => ({
   __esModule: true,
   default: { sync: jest.fn() },
}));

jest.mock('../../utils/verifyUser', () => ({
   __esModule: true,
   default: jest.fn(),
}));

jest.mock('fs/promises', () => ({
   __esModule: true,
   readFile: jest.fn(),
   writeFile: jest.fn(),
}));

jest.mock('../../utils/apiLogging', () => ({
   __esModule: true,
   withApiLogging: (handler: any) => handler,
}));

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
