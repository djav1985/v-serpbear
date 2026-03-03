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
    mockReadLocalSCData.mockResolvedValue(null);
  });

  it('loads keyword stats in a single aggregated query and maps to each domain', async () => {
    mockFindAll.mockResolvedValue([
      { domain: 'example.com', keywordCount: '2', maxLastUpdated: '2024-01-02T00:00:00.000Z' },
      { domain: 'second.com', keywordCount: '1', maxLastUpdated: '2024-01-03T00:00:00.000Z' },
    ]);

    const domains = [
      { ID: 1, domain: 'example.com', slug: 'example-com', notification: true, notification_interval: '', notification_emails: '', lastUpdated: '2024-01-01T00:00:00.000Z', added: '2024-01-01T00:00:00.000Z' },
      { ID: 2, domain: 'second.com', slug: 'second-com', notification: true, notification_interval: '', notification_emails: '', lastUpdated: '2024-01-01T00:00:00.000Z', added: '2024-01-01T00:00:00.000Z' },
    ] as any;

    const result = await getdomainStats(domains);

    expect(mockFindAll).toHaveBeenCalledTimes(1);
    expect(result[0].keywordsTracked).toBe(2);
    expect(result[1].keywordsTracked).toBe(1);
    expect(result[0].keywordsUpdated).toBe('2024-01-02T00:00:00.000Z');
  });

  it('falls back to domain lastUpdated when aggregate has no keyword timestamp', async () => {
    mockFindAll.mockResolvedValue([{ domain: 'example.com', keywordCount: '0', maxLastUpdated: null }]);

    const domain = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      notification: false,
      notification_interval: '',
      notification_emails: '',
      lastUpdated: '2024-01-05T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
      avgPosition: 0,
      mapPackKeywords: Number.NaN,
    } as any;

    const result = await getdomainStats([domain]);

    expect(result[0].keywordsUpdated).toBe('2024-01-05T00:00:00.000Z');
    expect(result[0].avgPosition).toBeUndefined();
    expect(result[0].mapPackKeywords).toBeUndefined();
  });
});
