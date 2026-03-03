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
      notification_interval: '',
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
      notification_interval: '',
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
      notification_interval: '',
      notification_emails: '',
      lastUpdated: '2023-01-01T00:00:00.000Z',
      added: '2023-01-01T00:00:00.000Z',
      avgPosition: 7, // Persisted value
      mapPackKeywords: 3, // Persisted value
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(2);
    expect(result[0].avgPosition).toBe(7); // Uses persisted value from domain
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
      notification_interval: '',
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
      { ID: 1, domain: 'a.com', slug: 'a-com', notification: false, notification_interval: '', notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
      { ID: 2, domain: 'b.com', slug: 'b-com', notification: false, notification_interval: '', notification_emails: '', lastUpdated: '2023-01-01T00:00:00.000Z', added: '2023-01-01T00:00:00.000Z' },
    ] as any[];

    await getdomainStats(domains);

    // Only one findAll call regardless of domain count (not N calls)
    expect(mockFindAll).toHaveBeenCalledTimes(1);
  });

  it('falls back to domain.lastUpdated when there are no keywords', async () => {
    mockFindAll.mockResolvedValue([]); // no aggregate row for domain
    mockReadLocalSCData.mockResolvedValue(null);

    const domain = {
      ID: 1,
      domain: 'empty.com',
      slug: 'empty-com',
      notification: false,
      notification_interval: '',
      notification_emails: '',
      lastUpdated: '2022-06-15T12:00:00.000Z',
      added: '2022-06-01T00:00:00.000Z',
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsTracked).toBe(0);
    expect(result[0].keywordsUpdated).toBe('2022-06-15T12:00:00.000Z');
  });
});
