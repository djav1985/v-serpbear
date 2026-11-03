export {};

import Cryptr from 'cryptr';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { scrapeKeywordWithStrategy } from '../../utils/scraper';

jest.mock('../../utils/scraper', () => ({
  __esModule: true,
  RefreshResult: undefined,
  removeFromRetryQueue: jest.fn().mockResolvedValue(undefined),
  retryScrape: jest.fn().mockResolvedValue(undefined),
  scrapeKeywordWithStrategy: jest.fn(),
}));

jest.mock('../../utils/updateDomainStats', () => ({
  __esModule: true,
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/retryQueueManager', () => ({
  __esModule: true,
  retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), update: jest.fn() },
}));

jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

const scrapeMock = scrapeKeywordWithStrategy as unknown as jest.Mock;

const makeDomain = (scraperSettings: string | null) => ({
  get: () => ({
    domain: 'example.com',
    scrapeEnabled: 1,
    scraper_settings: scraperSettings,
    business_name: null,
    scrape_strategy: '',
    scrape_pagination_limit: 0,
    scrape_smart_full_fallback: false,
  }),
});

const makeKeyword = (id: number) => {
  const plain = { ID: id, keyword: `kw ${id}`, domain: 'example.com', device: 'desktop', country: 'US', location: '', position: 0, url: '', lastResult: [], history: {}, mapPackTop3: 0, tags: [], localResults: [], updating: 1, lastUpdateError: 'false', sticky: 0, volume: 0, history7d: null, lastUpdated: '', added: '', updatingStartedAt: null };
  return {
    ID: id,
    domain: 'example.com',
    get: () => plain,
    update: jest.fn().mockResolvedValue(undefined),
  };
};

describe('refreshAndUpdateKeywords with a domain scraper key that cannot be decrypted', () => {
  const originalSecret = process.env.SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET = 'test-secret-for-override';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SECRET;
    } else {
      process.env.SECRET = originalSecret;
    }
  });

  it('does not scrape with the global key, and records a clear error on each keyword', async () => {
    const otherCryptr = new Cryptr('some-other-secret');
    const encryptedForAnotherSecret = otherCryptr.encrypt('serper-key');
    const domain = makeDomain(JSON.stringify({ scraper_type: 'serper', scraping_api: encryptedForAnotherSecret }));
    const keywords = [makeKeyword(1), makeKeyword(2)];

    await refreshAndUpdateKeywords(keywords as any, { scraper_type: 'serpapi', scraping_api: 'global-key' } as any, [domain] as any);

    expect(scrapeMock).not.toHaveBeenCalled();
    keywords.forEach((keyword) => {
      expect(keyword.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
      const payload = keyword.update.mock.calls[0][0];
      expect(JSON.parse(payload.lastUpdateError).error).toContain('could not be decrypted');
    });
  });

  it('still scrapes when the domain has no saved override key', async () => {
    const domain = makeDomain(null);
    const keywords = [makeKeyword(3)];
    scrapeMock.mockResolvedValue({ ID: 3, keyword: 'kw 3', position: 4, url: 'https://example.com/', result: [], mapPackTop3: false, error: false });

    await refreshAndUpdateKeywords(keywords as any, { scraper_type: 'serpapi', scraping_api: 'global-key' } as any, [domain] as any);

    expect(scrapeMock).toHaveBeenCalledTimes(1);
  });
});
