import { NextApiRequest, NextApiResponse } from 'next';
import { readFile, writeFile } from 'fs/promises';
import { type KeywordIdeasDatabase, getLocalKeywordIdeas, updateLocalKeywordIdeas } from '../../../utils/adwords';
jest.mock('../../../utils/searchConsole');
jest.mock('../../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../../utils/verifyUser');
jest.mock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('../../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

describe('adwords ideasPath', () => {
    const readMock = readFile as unknown as jest.Mock;
    const writeMock = writeFile as unknown as jest.Mock;

    describe('ideas file access only accepts real domain names', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      it.each(['../../settings', 'example/../../x', 'my_site-com.com', 'a b', '%2e%2e', ''])('refuses to read for %p without touching the file system', async (domain) => {
        await expect(getLocalKeywordIdeas(domain)).resolves.toBe(false);
        expect(readMock).not.toHaveBeenCalled();
      });

      it('refuses to write for a path-like domain', async () => {
        await expect(updateLocalKeywordIdeas('../../settings', { favorites: [] })).resolves.toBe(false);
        expect(writeMock).not.toHaveBeenCalled();
      });

      it('reads the ideas file of a hyphenated domain under its real name', async () => {
        readMock.mockResolvedValue(JSON.stringify({ keywords: [{ uid: 'k1' }] }));

        const result = await getLocalKeywordIdeas('my-site.com');

        expect(readMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_my-site\.com\.json$/), expect.anything());
        expect(result).toEqual({ keywords: [{ uid: 'k1' }] });
      });
    });
  });

describe('ideas route', () => {
  let readFile: any;
  let writeFile: any;
  let db: any;
  let handler: any;
  let verifyUser: any;
  let getAdwordsCredentials: any;
  let getAdwordsKeywordIdeas: any;
  let createMockRequest: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn() },
    }));
    jest.doMock('../../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
    jest.doMock('../../../utils/adwords', () => ({
      __esModule: true,
      ...jest.requireActual('../../../utils/adwords'),
      getAdwordsCredentials: jest.fn(),
      getAdwordsKeywordIdeas: jest.fn(),
      // The file lock needs a real file on disk; the test only checks the read-modify-write itself
      withIdeasLock: (_domain: string, fn: () => Promise<unknown>) => fn(),
    }));
    jest.doMock('../../../utils/atomicWrite', () => ({
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- forwards the temp path the route computed in tests
      atomicWriteFile: (filePath: string, data: string, encoding: string) => require('fs/promises').writeFile(filePath, data, encoding),
    }));
    jest.doMock('fs/promises', () => ({
      __esModule: true,
      readFile: jest.fn(),
      writeFile: jest.fn(),
    }));
    jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
    jest.doMock('../../../utils/logger', () => ({
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        isSuccessLoggingEnabled: jest.fn(() => true),
      },
    }));
    const m0 = require('fs/promises');
    readFile = m0.readFile;
    writeFile = m0.writeFile;
    const m1 = require('../../../database/database');
    db = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/google/ideas/route'));
    handler = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../../utils/verifyUser');
    verifyUser = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../../../utils/adwords');
    getAdwordsCredentials = m4.getAdwordsCredentials;
    getAdwordsKeywordIdeas = m4.getAdwordsKeywordIdeas;
    const m5 = require('../../__helpers__');
    createMockRequest = m5.createMockRequest;
    createMockResponse = m5.createMockResponse;
  });

  // The local keyword store (getLocalKeywordIdeas / updateLocalKeywordIdeas) runs for real so the
  // favorites test can assert what is persisted; only the Google Ads calls are stubbed.
  // Writes go through atomicWriteFile; route them to the mocked writeFile so the assertions still see the contents
  const valid = { keywords: ['shoes'], country: 'US', language: '1000', domain: 'example.com', seedType: 'custom' };

  const post = async (body: Record<string, unknown>) => {
    const req = createMockRequest({ method: 'POST', body });
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return res;
  };

  const get = async (query: Record<string, unknown> = {}) => {
    const req = createMockRequest({ method: 'GET', query });
    const res = createMockResponse();
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return res;
  };

  describe('GET /api/google/ideas', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (verifyUser as jest.Mock).mockReturnValue('authorized');
    });

    it('loads the research ideas list when no domain is provided', async () => {
      const saved = { keywords: [{ uid: 'idea-1', keyword: 'shoes' }], favorites: [] };
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(saved));

      const res = await get();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: saved });
      expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_research\.json$/), { encoding: 'utf-8' });
    });

    it('rejects an invalid domain before reading the ideas file', async () => {
      const res = await get({ domain: '../../settings' });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'Invalid domain' }) }));
      expect(readFile).not.toHaveBeenCalled();
    });

    it('reports a missing ideas file as a client-readable load error', async () => {
      (readFile as jest.Mock).mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      const res = await get({ domain: 'example.com' });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'Error Loading Keyword Ideas.' }) }));
    });
  });

  describe('POST /api/google/ideas input validation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (getAdwordsCredentials as jest.Mock).mockResolvedValue({ client_id: 'a', client_secret: 'b', developer_token: 'c', account_id: 'd', refresh_token: 'e' });
      (getAdwordsKeywordIdeas as jest.Mock).mockResolvedValue([{ uid: 'us:shoes', keyword: 'shoes' }]);
    });

    it.each([
      ['a domain that could leave the data folder', { domain: '../../../etc/passwd' }],
      ['a domain that is not a string', { domain: ['a'] }],
      ['a domain without a dot', { domain: 'localhost' }],
      ['an auto seed without a domain', { seedType: 'auto', domain: undefined }],
      ['a country that is not a two-letter code', { country: 'USA' }],
      ['a language that is not a numeric ID', { language: 'english' }],
      ['keywords that are not strings', { keywords: [{ a: 1 }] }],
      ['a seed flag that is not a boolean', { seedSCKeywords: 'false' }],
    ])('returns 400 for %s, before calling Google Ads', async (_label, override) => {
      const res = await post({ ...valid, ...override });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(getAdwordsKeywordIdeas).not.toHaveBeenCalled();
    });

    it('accepts a valid request', async () => {
      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledTimes(1);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ domain: 'example.com' }));
    });

    it('upper-cases a lower-case country code before calling Google Ads', async () => {
      const res = await post({ ...valid, country: 'gb' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ country: 'GB' }));
    });

    it('answers 400 instead of 500 for a null body', async () => {
      const req = createMockRequest({ method: 'POST', body: null });
      const res = createMockResponse();
      await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('does not return the raw Google Ads error text to the client', async () => {
      (getAdwordsKeywordIdeas as jest.Mock).mockRejectedValue(new Error('Google Ads API error (403): developer token secret-detail'));
      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain('secret-detail');
    });

    it('treats a request without a domain as research and passes no domain to Google Ads', async () => {
      const res = await post({ ...valid, domain: undefined });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(getAdwordsKeywordIdeas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ domain: '' }));
    });

    it.each([
      [{ ...valid, seedType: undefined }, 'Missing seedType'],
      [{ ...valid, seedType: 'unsupported' }, 'Invalid seedType'],
      [{ ...valid, seedType: 'custom', keywords: [] }, 'Please Provide one of these'],
    ])('rejects a missing, unsupported or empty custom seed (%p)', async (body, message) => {
      const res = await post(body as Record<string, unknown>);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining(message) }) }));
      expect(getAdwordsKeywordIdeas).not.toHaveBeenCalled();
    });

    it('returns a setup error when Google Ads credentials are incomplete', async () => {
      (getAdwordsCredentials as jest.Mock).mockResolvedValue({ client_id: 'a', client_secret: 'b' });

      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'Google Ads credentials not configured' }) }));
      expect(getAdwordsKeywordIdeas).not.toHaveBeenCalled();
    });

    it('returns not found when Google Ads responds with no ideas', async () => {
      (getAdwordsKeywordIdeas as jest.Mock).mockResolvedValue([]);

      const res = await post(valid);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'NOT_FOUND' }) }));
    });

    it('turns a missing seed-keyword error into a request error', async () => {
      (getAdwordsKeywordIdeas as jest.Mock).mockRejectedValue(new Error('No tracked keywords found for this domain'));

      const res = await post({ ...valid, keywords: [], seedCurrentKeywords: true });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'No tracked keywords found for this domain' }) }));
    });
  });

  describe('PUT /api/google/ideas favorites persistence', () => {
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
           body: { keywordID: 'kw-1', domain: 'example.com' },
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

     it('adds a matching idea to favorites and leaves saved ideas intact', async () => {
        const keyword = { uid: 'kw-2', keyword: 'coffee beans' } as any;
        const storedDatabase = { keywords: [keyword], favorites: [], settings: { seedType: 'custom' }, updated: Date.now() } as KeywordIdeasDatabase;
        (readFile as jest.Mock).mockResolvedValue(JSON.stringify(storedDatabase));
        const req = createMockRequest({ method: 'PUT', body: { keywordID: 'kw-2', domain: 'example.com' } });
        const res = createMockResponse();

        await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ keywords: [keyword], error: '' });
        const [, contents] = (writeFile as jest.Mock).mock.calls[0];
        expect((JSON.parse(contents as string) as KeywordIdeasDatabase).keywords).toEqual([keyword]);
        expect((JSON.parse(contents as string) as KeywordIdeasDatabase).favorites).toEqual([keyword]);
     });

     it('rejects a favorite request without a keyword ID before reading storage', async () => {
        const req = createMockRequest({ method: 'PUT', body: { domain: 'example.com' } });
        const res = createMockResponse();

        await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(readFile).not.toHaveBeenCalled();
        expect(writeFile).not.toHaveBeenCalled();
     });
  });
});
