import getdomainStats from '../../utils/domains';
import Keyword from '../../database/models/keyword';
import { readLocalSCData } from '../../utils/searchConsole';

jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('../../utils/searchConsole', () => ({
  __esModule: true,
  readLocalSCData: jest.fn(),
}));

const mockFindAll = (Keyword as any).findAll as jest.Mock;
const mockReadLocalSCData = readLocalSCData as jest.Mock;

// Consecutive day keys starting at 2024-01-01, so Search Console stat rows carry real dates
const dateKeyOffset = (offset: number): string => new Date(Date.UTC(2024, 0, 1 + offset)).toISOString().slice(0, 10);

describe('getdomainStats', () => {
  beforeEach(() => {
    mockFindAll.mockReset();
    mockReadLocalSCData.mockReset();
  });

  it('omits avgPosition and mapPackKeywords when the domain lacks persisted values', async () => {
    // Aggregate query returns no rows for this domain (no keywords)
    mockFindAll.mockResolvedValue([]);
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      notification: false,
     
      notification_emails: '',
      lastUpdated: new Date().toISOString(),
      added: new Date().toISOString(),
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(0);
    expect(result[0].avgPosition).toBeUndefined();
    expect(result[0].mapPackKeywords).toBeUndefined();
  });

  it('returns keywordsTracked and keywordsUpdated from the aggregated query result', async () => {
    // Aggregate query returns one row with count=3 and maxLastUpdated='2023-01-03'
    mockFindAll.mockResolvedValue([
      { domain: 'example.com', keywordsTracked: '3', maxLastUpdated: '2023-01-03' },
    ]);
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      notification: false,
     
      notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(3);
    expect(result[0].avgPosition).toBeUndefined();
    expect(result[0].mapPackKeywords).toBeUndefined();
    expect(result[0].keywordsUpdated).toBe('2023-01-03T00:00:00.000Z');
  });

  it('uses persisted avgPosition and mapPackKeywords from domain when available', async () => {
    mockFindAll.mockResolvedValue([
      { domain: 'persisted.com', keywordsTracked: '2', maxLastUpdated: '2023-01-02' },
    ]);
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'persisted.com',
      slug: 'persisted-com',
      notification: false,
     
      notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      avgPosition: 5, // Persisted value, a whole number
      mapPackKeywords: 3, // Persisted value
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(2);
    expect(result[0].avgPosition).toBe(5); // Uses persisted value from domain
    expect(result[0].mapPackKeywords).toBe(3); // Uses persisted value from domain
  });

  it('removes invalid persisted stats when values are zero or non-numeric', async () => {
    mockFindAll.mockResolvedValue([]);
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'stale-stats.com',
      slug: 'stale-stats-com',
      notification: false,
     
      notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      avgPosition: 0,
      mapPackKeywords: Number.NaN,
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].avgPosition).toBeUndefined();
    expect(result[0].mapPackKeywords).toBeUndefined();
  });

  it('issues a single findAll call regardless of how many domains are passed', async () => {
    mockFindAll.mockResolvedValue([
      { domain: 'a.com', keywordsTracked: '1', maxLastUpdated: '2023-01-01' },
      { domain: 'b.com', keywordsTracked: '2', maxLastUpdated: '2023-01-02' },
    ]);
    mockReadLocalSCData.mockResolvedValue(null);

    const domains = [
      { ID: 1, domain: 'a.com', slug: 'a-com', notification: false, notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
      { ID: 2, domain: 'b.com', slug: 'b-com', notification: false, notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
    ] as any[];

    await getdomainStats(domains);

    // Only one findAll call regardless of domain count (not N calls)
    expect(mockFindAll).toHaveBeenCalledTimes(1);
  });

  it('compares the last 7 Search Console days with the 7 days before them', async () => {
    mockFindAll.mockResolvedValue([]);
    const dayStat = (clicks: number, impressions: number, position: number, offset: number) => ({ date: dateKeyOffset(offset), clicks, impressions, ctr: 0, position });
    mockReadLocalSCData.mockResolvedValue({
      stats: [
        ...Array.from({ length: 7 }, (_, i) => dayStat(1, 10, 20, i)), // previous 7 days
        ...Array.from({ length: 7 }, (_, i) => dayStat(2, 30, 10, 7 + i)), // current 7 days
      ],
    });

    const domain = {
      ID: 1, domain: 'sc.com', slug: 'sc-com', notification: false, notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].scVisits).toBe(14);
    expect(result[0].scImpressions).toBe(210);
    expect(result[0].scPosition).toBe(10);
    expect(result[0].scVisitsPrev).toBe(7);
    expect(result[0].scImpressionsPrev).toBe(70);
    expect(result[0].scPositionPrev).toBe(20);
  });

  it('omits the Search Console previous values when fewer than 14 days are stored', async () => {
    mockFindAll.mockResolvedValue([]);
    mockReadLocalSCData.mockResolvedValue({
      stats: Array.from({ length: 10 }, (_, i) => ({ date: dateKeyOffset(i), clicks: 1, impressions: 5, ctr: 0, position: 8 })),
    });

    const domain = {
      ID: 1, domain: 'short.com', slug: 'short-com', notification: false, notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].scVisits).toBe(7);
    expect(result[0].scVisitsPrev).toBeUndefined();
    expect(result[0].scImpressionsPrev).toBeUndefined();
    expect(result[0].scPositionPrev).toBeUndefined();
  });

  it('picks the Search Console windows by date when days without impressions are missing', async () => {
    mockFindAll.mockResolvedValue([]);
    // Days 1-5 and 12-14 only: a row count of 7 would reach back to day 4 instead of day 8
    const rows = [1, 2, 3, 4, 5, 12, 13, 14].map((day) => ({ date: dateKeyOffset(day - 1), clicks: day, impressions: 10, ctr: 0, position: 5 }));
    mockReadLocalSCData.mockResolvedValue({ stats: rows });

    const domain = {
      ID: 1, domain: 'gaps.com', slug: 'gaps-com', notification: false, notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    // Current window = days 8-14 (only 12, 13, 14 have rows); previous window = days 1-7 (rows 1-5)
    expect(result[0].scVisits).toBe(12 + 13 + 14);
    expect(result[0].scVisitsPrev).toBe(1 + 2 + 3 + 4 + 5);
  });

  it('falls back to domain.lastUpdated when there are no keywords', async () => {
    mockFindAll.mockResolvedValue([]); // no aggregate row for domain
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'empty.com',
      slug: 'empty-com',
      notification: false,
     
      notification_emails: '',
      lastUpdated: '2022-06-15T12:00:00.000Z',
      added: '2022-06-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(0);
    expect(result[0].keywordsUpdated).toBe('2022-06-15T12:00:00.000Z');
  });

  it('does not change the domain objects it was given', async () => {
    (Keyword.findAll as jest.Mock).mockResolvedValue([{ domain: 'example.com', keywordsTracked: 2, maxLastUpdated: null }]);
    (readLocalSCData as jest.Mock).mockResolvedValue(false);
    const input = { domain: 'example.com', lastUpdated: '2022-06-15T12:00:00.000Z', avgPosition: 0 } as any;
    const snapshot = JSON.stringify(input);

    const result = await getdomainStats([input]);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(result[0]).not.toBe(input);
    expect(result[0].keywordsTracked).toBe(2);
  });
});
