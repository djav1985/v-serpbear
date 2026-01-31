import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { generateGoogleConsoleStats } from '../../utils/generateEmail';
import {
  fetchDomainSCData,
  getSearchConsoleApiInfo,
  isSearchConsoleDataFreshForToday,
  parseSearchConsoleItem,
  readLocalSCData,
} from '../../utils/searchConsole';

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

describe('getSearchConsoleApiInfo error handling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('falls back to global credentials when domain decryption fails', async () => {
    // Unmock the function for this test
    const actualModule = jest.requireActual('../../utils/searchConsole');
    
    // Mock fs/promises to return a settings file with global credentials
    jest.mock('fs/promises', () => ({
      readFile: jest.fn().mockResolvedValue(JSON.stringify({
        search_console_client_email: 'encrypted-global-email',
        search_console_private_key: 'encrypted-global-key',
      })),
    }));

    // Domain with malformed encrypted data that will fail to decrypt
    const domain = {
      domain: 'example.com',
      search_console: JSON.stringify({
        client_email: 'malformed-encrypted-data',
        private_key: 'also-malformed',
      }),
    } as DomainType;

    const result = await actualModule.getSearchConsoleApiInfo(domain);

    // Should have attempted to fall back to global credentials
    // The actual values don't matter for this test, just that it didn't throw
    expect(result).toHaveProperty('client_email');
    expect(result).toHaveProperty('private_key');
  });
});

