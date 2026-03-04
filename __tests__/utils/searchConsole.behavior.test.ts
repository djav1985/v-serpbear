import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import path from 'path';

import { generateGoogleConsoleStats } from '../../utils/generateEmail';
import {
  fetchDomainSCData,
  getSearchConsoleApiInfo,
  getSafeSCDataFilePath,
  integrateKeywordSCData,
  isSearchConsoleDataFreshForToday,
  parseSearchConsoleItem,
  readLocalSCData,
  resolveDomainIdentifier,
} from '../../utils/searchConsole';
import { logger } from '../../utils/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

jest.mock('../../utils/insight', () => ({
  getKeywordsInsight: jest.fn(() => [
    { keyword: 'test keyword', clicks: 5, impressions: 10, position: 2 },
  ]),
  getPagesInsight: jest.fn(() => [
    { page: '/test', clicks: 3, impressions: 6, position: 4 },
  ]),
}));

jest.mock('../../utils/searchConsole', () => {
  const actualModule = jest.requireActual('../../utils/searchConsole');
  return {
    ...actualModule,
    readLocalSCData: jest.fn(),
    fetchDomainSCData: jest.fn(),
    getSearchConsoleApiInfo: jest.fn(),
  };
});

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

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockRejectedValue(new Error('file not found')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({})),
}));

const mockSCQuery = jest.fn();
jest.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: jest.fn().mockImplementation(() => ({
      searchanalytics: { query: mockSCQuery },
    })),
  },
}));

const mockReadLocalSCData = readLocalSCData as jest.Mock;
const mockFetchDomainSCData = fetchDomainSCData as jest.Mock;
const mockGetSearchConsoleApiInfo = getSearchConsoleApiInfo as jest.Mock;

describe('Search Console caching helpers', () => {
  const originalCronTimezone = process.env.CRON_TIMEZONE;
  const timezoneSetting = 'America/New_York';

  beforeEach(() => {
    process.env.CRON_TIMEZONE = timezoneSetting;
    jest.clearAllMocks();
    mockReadLocalSCData.mockReset();
    mockFetchDomainSCData.mockReset();
    mockGetSearchConsoleApiInfo.mockReset();
    mockGetSearchConsoleApiInfo.mockResolvedValue({ client_email: '', private_key: '' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.CRON_TIMEZONE = originalCronTimezone;
  });

  it('detects that lastFetched occurred today in the cron timezone', () => {
    const now = dayjs.tz('2023-12-10 10:00', timezoneSetting);
    jest.spyOn(Date, 'now').mockReturnValue(now.valueOf());
    const sameDayIso = now.startOf('day').add(1, 'hour').toDate().toISOString();

    expect(isSearchConsoleDataFreshForToday(sameDayIso, timezoneSetting)).toBe(true);
  });

  it('refetches data when cache is from a previous day', async () => {
    const now = dayjs.tz('2023-12-10 10:00', timezoneSetting);
    jest.spyOn(Date, 'now').mockReturnValue(now.valueOf());
    const staleIso = now.subtract(1, 'day').add(2, 'hour').toDate().toISOString();

    mockReadLocalSCData.mockResolvedValue({
      lastFetched: staleIso,
      stats: [
        { date: '2023-12-09', clicks: 5, impressions: 9, ctr: 1.2, position: 3 },
      ],
    });
    mockGetSearchConsoleApiInfo
      .mockResolvedValueOnce({ client_email: 'domain@example.com', private_key: 'domain-key' })
      .mockResolvedValueOnce({ client_email: '', private_key: '' });
    mockFetchDomainSCData.mockResolvedValue({
      lastFetched: now.toDate().toISOString(),
      stats: [
        { date: '2023-12-10', clicks: 7, impressions: 13, ctr: 1.4, position: 2 },
      ],
    });

    await generateGoogleConsoleStats({ domain: 'example.com' } as any);

    expect(mockFetchDomainSCData).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when cache was updated today', async () => {
    const now = dayjs.tz('2023-12-10 10:00', timezoneSetting);
    jest.spyOn(Date, 'now').mockReturnValue(now.valueOf());
    const sameDayIso = now.startOf('day').add(1, 'hour').toDate().toISOString();

    mockReadLocalSCData.mockResolvedValue({
      lastFetched: sameDayIso,
      stats: [
        { date: '2023-12-10', clicks: 7, impressions: 14, ctr: 1.4, position: 2 },
      ],
    });

    const html = await generateGoogleConsoleStats({ domain: 'example.com' } as any);

    expect(mockFetchDomainSCData).not.toHaveBeenCalled();
    expect(html).toContain('Google Search Console Stats');
  });
});

describe('parseSearchConsoleItem', () => {
  const baseItem = {
    clicks: 1,
    impressions: 2,
    ctr: 0.5,
    position: 3,
    keys: ['keyword', 'DESKTOP', 'USA', ''],
  } as any;

  const buildItem = (page: string) => ({
    ...baseItem,
    keys: [...baseItem.keys.slice(0, 3), page],
  });

  it('removes protocol and optional www prefix for the root domain', () => {
    const item = buildItem('https://www.example.com/about');
    const parsed = parseSearchConsoleItem(item, 'example.com');

    expect(parsed.page).toBe('/about');
  });

  it('keeps the root domain path when no www prefix is present', () => {
    const item = buildItem('http://example.com/team');
    const parsed = parseSearchConsoleItem(item, 'example.com');

    expect(parsed.page).toBe('/team');
  });

  it('returns an empty string for the homepage', () => {
    const item = buildItem('https://example.com/');
    const parsed = parseSearchConsoleItem(item, 'example.com');

    expect(parsed.page).toBe('');
  });

  it('preserves non-www subdomains while ensuring a leading slash', () => {
    const item = buildItem('https://www2.example.com/path');
    const parsed = parseSearchConsoleItem(item, 'example.com');

    expect(parsed.page).toBe('/www2.example.com/path');
  });

  it('maps alpha-3 country codes with fallback to the original code', () => {
    const mappedItem = {
      ...baseItem,
      keys: ['keyword', 'DESKTOP', 'USA', 'https://example.com/'],
    };
    const fallbackItem = {
      ...baseItem,
      keys: ['keyword', 'DESKTOP', 'XYZ', 'https://example.com/'],
    };

    expect(parseSearchConsoleItem(mappedItem, 'example.com').country).toBe('US');
    expect(parseSearchConsoleItem(fallbackItem, 'example.com').country).toBe('XYZ');
  });
});

describe('integrateKeywordSCData field mapping', () => {
  const baseKeyword = {
    keyword: 'test keyword',
    country: 'US',
    device: 'desktop',
    scData: null,
  } as unknown as KeywordType;

  const buildSCData = (overrides = {}): SCDomainDataType => ({
    threeDays: [],
    sevenDays: [],
    thirtyDays: [],
    lastFetched: '',
    lastFetchError: '',
    stats: [],
    ...overrides,
  });

  const makeItem = (uid: string, clicks: number, impressions: number, ctr: number, position: number) => ({
    uid,
    keyword: 'test keyword',
    device: 'desktop',
    country: 'US',
    page: '',
    clicks,
    impressions,
    ctr,
    position,
  });

  it('maps impressions, visits, ctr, and position from threeDays data', () => {
    const uid = 'us:desktop:test_keyword';
    const scData = buildSCData({
      threeDays: [makeItem(uid, 6, 30, 20, 3)],
    });

    const result = integrateKeywordSCData(baseKeyword, scData);

    expect(result.scData!.visits.threeDays).toBe(6);
    expect(result.scData!.impressions.threeDays).toBe(30);
    expect(result.scData!.ctr.threeDays).toBe(20);
    expect(result.scData!.position.threeDays).toBe(3);
  });

  it('computes averages correctly for sevenDays data', () => {
    const uid = 'us:desktop:test_keyword';
    const scData = buildSCData({
      sevenDays: [makeItem(uid, 14, 70, 14, 7)],
    });

    const result = integrateKeywordSCData(baseKeyword, scData);

    expect(result.scData!.visits.avgSevenDays).toBe(2);
    expect(result.scData!.impressions.avgSevenDays).toBe(10);
  });

  it('computes averages correctly for thirtyDays data', () => {
    const uid = 'us:desktop:test_keyword';
    const scData = buildSCData({
      thirtyDays: [makeItem(uid, 60, 300, 30, 15)],
    });

    const result = integrateKeywordSCData(baseKeyword, scData);

    expect(result.scData!.visits.avgThirtyDays).toBe(2);
    expect(result.scData!.impressions.avgThirtyDays).toBe(10);
  });

  it('returns zeros for all fields when no matching SC data exists', () => {
    const scData = buildSCData();

    const result = integrateKeywordSCData(baseKeyword, scData);

    expect(result.scData!.visits.sevenDays).toBe(0);
    expect(result.scData!.impressions.thirtyDays).toBe(0);
    expect(result.scData!.position.threeDays).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// fetchSearchConsoleData error logging
// ---------------------------------------------------------------------------

const mockDomainForSC = {
  domain: 'example.com',
  search_console: JSON.stringify({ property_type: 'domain', url: '' }),
} as any;

const mockApiForSC = { client_email: 'test@example.com', private_key: 'test-key' };

describe('fetchSearchConsoleData error logging', () => {
  const { fetchDomainSCData: realFetchDomainSCData } = jest.requireActual('../../utils/searchConsole');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSCQuery.mockRejectedValue(new Error('simulated API error'));
  });

  it('logs with (stats) suffix when the stat fetch fails', async () => {
    await realFetchDomainSCData(mockDomainForSC, mockApiForSC);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    expect(errorMessages.some((m) => m.includes('(stats)'))).toBe(true);
  });

  it('logs with (<days>days) suffix when a non-stat fetch fails', async () => {
    await realFetchDomainSCData(mockDomainForSC, mockApiForSC);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    expect(errorMessages.some((m) => /\(\d+days\)/.test(m))).toBe(true);
  });

  it('never logs (stats) suffix for non-stat fetches', async () => {
    await realFetchDomainSCData(mockDomainForSC, mockApiForSC);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    const daysCalls = errorMessages.filter((m) => /\(\d+days\)/.test(m));
    daysCalls.forEach((m) => {
      expect(m).not.toContain('(stats)');
    });
  });
});

// ---------------------------------------------------------------------------
// Domain Conversion Fixes (getSafeSCDataFilePath, resolveDomainIdentifier)
// ---------------------------------------------------------------------------

describe('Domain Conversion Fixes', () => {
  let cwdSpy: jest.SpyInstance;
  let resolveSpy: jest.SpyInstance;

  beforeAll(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/test');
    resolveSpy = jest.spyOn(path, 'resolve').mockImplementation((...segments: string[]) => {
      const joined = segments.join('/').replace(/\/+/g, '/');
      return joined.startsWith('/') ? joined : `/${joined}`;
    });
  });

  afterAll(() => {
    cwdSpy.mockRestore();
    resolveSpy.mockRestore();
  });

  describe('resolveDomainIdentifier', () => {
    it('should convert slugs back to proper domains', () => {
      expect(resolveDomainIdentifier('vontainment-com')).toBe('vontainment.com');
      expect(resolveDomainIdentifier('example-org')).toBe('example.org');
      expect(resolveDomainIdentifier('my-test-domain-com')).toBe('my.test.domain.com');
      expect(resolveDomainIdentifier('my_site-com')).toBe('my-site.com');
      expect(resolveDomainIdentifier('research')).toBe('research');
    });

    it('should preserve domains that already contain dots and hyphens', () => {
      expect(resolveDomainIdentifier('my-site.com')).toBe('my-site.com');
      expect(resolveDomainIdentifier('my.site.com')).toBe('my.site.com');
    });
  });

  describe('Search Console File Path Generation', () => {
    it('should convert domain identifiers to distinct file paths', () => {
      const hyphenatedDomainPath = getSafeSCDataFilePath('my-site.com');
      const dottedDomainPath = getSafeSCDataFilePath('my.site.com');
      const hyphenSlugPath = getSafeSCDataFilePath('my_site-com');
      const dottedSlugPath = getSafeSCDataFilePath('my-site-com');

      expect(hyphenatedDomainPath).toBe('/test/data/SC_my-site.com.json');
      expect(dottedDomainPath).toBe('/test/data/SC_my.site.com.json');
      expect(hyphenSlugPath).toBe('/test/data/SC_my-site.com.json');
      expect(dottedSlugPath).toBe('/test/data/SC_my.site.com.json');
      expect(hyphenatedDomainPath).not.toBe(dottedDomainPath);
    });

    it('should convert historical slugs to proper SC file paths', () => {
      const result1 = getSafeSCDataFilePath('vontainment-com');
      expect(result1).toBe('/test/data/SC_vontainment.com.json');

      const result2 = getSafeSCDataFilePath('example-org');
      expect(result2).toBe('/test/data/SC_example.org.json');

      const result3 = getSafeSCDataFilePath('my-test-domain-co-uk');
      expect(result3).toBe('/test/data/SC_my.test.domain.co.uk.json');

      const result4 = getSafeSCDataFilePath('research');
      expect(result4).toBe('/test/data/SC_research.json');
    });

    it('should handle invalid characters safely', () => {
      const result = getSafeSCDataFilePath('test@domain#with$special-chars');
      expect(result).toBe('/test/data/SC_test_domain_with_special-chars.json');
    });
  });
});
