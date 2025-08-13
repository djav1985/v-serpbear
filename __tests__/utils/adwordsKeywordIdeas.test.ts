jest.mock('../../utils/searchConsole', () => ({
  readLocalSCData: jest.fn(),
}));
jest.mock('../../utils/parseKeywords', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([{ keyword: 'db-kw' }]),
}));

import Keyword from '../../database/models/keyword';
import * as scUtils from '../../utils/searchConsole';
import * as adwordsUtils from '../../utils/adwords';

describe('getAdwordsKeywordIdeas', () => {
  const creds = {
    client_id: '',
    client_secret: '',
    developer_token: '',
    account_id: '123-456-7890',
    refresh_token: '',
  } as any;

  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ access_token: 'test-token' }),
      status: 200,
    }) as any;
    jest.spyOn(Keyword, 'findAll').mockResolvedValue([] as any);
    jest.spyOn(scUtils, 'readLocalSCData').mockResolvedValue(null as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws error when no tracked keywords found', async () => {
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        creds,
        { country: 'US', language: '1000', domainUrl: 'example.com', seedType: 'tracking' },
        true,
      ),
    ).rejects.toThrow('No tracked keywords found for this domain');
  });

  it('throws error when no search console keywords found', async () => {
    (scUtils.readLocalSCData as jest.Mock).mockResolvedValue({ thirtyDays: [] });
    await expect(
      adwordsUtils.getAdwordsKeywordIdeas(
        creds,
        { country: 'US', language: '1000', domainUrl: 'example.com', seedType: 'searchconsole' },
        true,
      ),
    ).rejects.toThrow('No search console keywords found for this domain');
  });
});

describe('seedKeywordsFromSources', () => {
  it('gathers keywords from multiple sources', async () => {
    (scUtils.readLocalSCData as jest.Mock).mockResolvedValue({
      thirtyDays: [{ keyword: 'sc1', impressions: 50 }],
    });
    jest.spyOn(Keyword, 'findAll').mockResolvedValue([{ get: () => ({}) }] as any);
    const seeds = await adwordsUtils.seedKeywordsFromSources({
      seedType: 'searchconsole',
      seedSCKeywords: true,
      seedCurrentKeywords: true,
      domainUrl: 'example.com',
      keywords: ['base'],
    });
    expect(seeds).toEqual(expect.arrayContaining(['base', 'sc1', 'db-kw']));
  });
});

describe('buildAdwordsRequest', () => {
  it('creates payload with keywordSeed', () => {
    const payload = adwordsUtils.buildAdwordsRequest({
      seedType: 'custom',
      country: 'US',
      language: '1000',
      seedKeywords: ['a', 'b'],
      domainUrl: 'example.com',
      test: true,
    });
    expect(payload).toMatchObject({
      keywordSeed: { keywords: ['a', 'b'] },
      pageSize: '1',
      geoTargetConstants: 'geoTargetConstants/2840',
      language: 'languageConstants/1000',
    });
  });

  it('creates payload with siteSeed for auto', () => {
    const payload = adwordsUtils.buildAdwordsRequest({
      seedType: 'auto',
      country: 'US',
      language: '1000',
      seedKeywords: [],
      domainUrl: 'example.com',
      test: false,
    });
    expect(payload).toMatchObject({
      siteSeed: { site: 'example.com' },
      pageSize: '1000',
    });
    expect((payload as any).keywordSeed).toBeUndefined();
  });
});
