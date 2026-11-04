export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/ideas';
import verifyUser from '../../utils/verifyUser';
import { getAdwordsCredentials, getAdwordsKeywordIdeas } from '../../utils/adwords';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/adwords', () => ({
  __esModule: true,
  getAdwordsCredentials: jest.fn(),
  getAdwordsKeywordIdeas: jest.fn(),
  getLocalKeywordIdeas: jest.fn(),
  updateLocalKeywordIdeas: jest.fn(),
}));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));
jest.mock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

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
