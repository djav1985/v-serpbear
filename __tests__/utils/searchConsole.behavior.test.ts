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
} from '../../utils/searchConsole';
import { logger } from '../../utils/logger';

dayjs.extend(utc);
dayjs.extend(timezone);

// Captured before the "Domain Conversion Fixes" suite spies on path.resolve with a POSIX-style stub,
// so expected file paths are built with the real platform resolver (matches utils/searchConsole.ts).
const realPathResolve = path.resolve.bind(path);

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
  const originalTimezone = process.env.TZ;
  const timezoneSetting = 'America/New_York';

  beforeEach(() => {
    process.env.TZ = timezoneSetting;
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
    process.env.TZ = originalTimezone;
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

  it('matches Search Console rows to tracked keywords regardless of case and surrounding spaces', () => {
    const scData = buildSCData({ threeDays: [makeItem('us:desktop:test_keyword', 5, 50, 10, 3)] as any });

    const result = integrateKeywordSCData({ ...baseKeyword, keyword: '  Test Keyword ' } as KeywordType, scData);

    expect(result.scData?.visits.threeDays).toBe(5);
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

describe('fetchSearchConsoleData date window', () => {
  const { fetchSearchConsoleData: realFetchSearchConsoleData } = jest.requireActual('../../utils/searchConsole');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSCQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('covers exactly 3, 7 and 30 inclusive calendar days', async () => {
    for (const days of [3, 7, 30]) {
      mockSCQuery.mockClear();
      await realFetchSearchConsoleData(mockDomainForSC, days, undefined, mockApiForSC);

      const { startDate, endDate } = mockSCQuery.mock.calls[0][0].requestBody;
      const span = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
      expect(span).toBe(days);
    }
  });

  it('pages through results with startRow until a page is shorter than the 25000 row limit', async () => {
    const fullPage = Array.from({ length: 25000 }, (_, i) => ({
      keys: [`kw${i}`, 'DESKTOP', 'usa', 'https://example.com/'], clicks: 1, impressions: 1, ctr: 0, position: 1,
    }));
    mockSCQuery
      .mockResolvedValueOnce({ data: { rows: fullPage } })
      .mockResolvedValueOnce({ data: { rows: [{ keys: ['last', 'mobile', 'usa', 'https://example.com/'], clicks: 2, impressions: 2, ctr: 0, position: 2 }] } });

    const res = await realFetchSearchConsoleData(mockDomainForSC, 3, undefined, mockApiForSC);

    expect(mockSCQuery).toHaveBeenCalledTimes(2);
    expect(mockSCQuery.mock.calls[0][0].requestBody.startRow).toBe(0);
    expect(mockSCQuery.mock.calls[1][0].requestBody.startRow).toBe(25000);
    expect(mockSCQuery.mock.calls[1][0].requestBody.rowLimit).toBe(25000);
    expect(res).toHaveLength(25001);
  });
});

describe('fetchSearchConsoleData error logging', () => {
  const { fetchDomainSCData: realFetchDomainSCData } = jest.requireActual('../../utils/searchConsole');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSCQuery.mockRejectedValue(new Error('simulated API error'));
  });

  it('logs the (stats) suffix for the stat fetch and (<days>days) for others, never mixing them', async () => {
    await realFetchDomainSCData(mockDomainForSC, mockApiForSC);

    const errorMessages: string[] = (logger.error as jest.Mock).mock.calls.map(
      ([msg]: [string]) => msg,
    );
    expect(errorMessages.some((m) => m.includes('(stats)'))).toBe(true);
    expect(errorMessages.some((m) => /\(\d+days\)/.test(m))).toBe(true);
    const daysCalls = errorMessages.filter((m) => /\(\d+days\)/.test(m));
    daysCalls.forEach((m) => {
      expect(m).not.toContain('(stats)');
    });
  });
});

// ---------------------------------------------------------------------------
// Domain Conversion Fixes (getSafeSCDataFilePath)
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

  describe('Search Console File Path Generation', () => {
    it('should convert domain identifiers to distinct file paths', () => {
      const hyphenatedDomainPath = getSafeSCDataFilePath('my-site.com');
      const dottedDomainPath = getSafeSCDataFilePath('my.site.com');

      expect(hyphenatedDomainPath).toBe(realPathResolve('/test', 'data', 'SC_my-site.com.json'));
      expect(dottedDomainPath).toBe(realPathResolve('/test', 'data', 'SC_my.site.com.json'));
      expect(hyphenatedDomainPath).not.toBe(dottedDomainPath);
    });

    it('should handle invalid characters safely', () => {
      const result = getSafeSCDataFilePath('test@domain#with$special-chars');
      expect(result).toBe(realPathResolve('/test', 'data', 'SC_test_domain_with_special-chars.json'));
    });
  });
});
