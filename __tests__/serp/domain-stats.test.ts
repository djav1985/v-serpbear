import { UNRANKED_PENALTY_PER_PAGE, getUnrankedPenalty, summarizeAveragePosition } from '../../utils/averagePosition';

describe('domain stats helpers', () => {
  let getdomainStats: any;
  let Keyword: any;
  let readLocalSCData: any;
  jest.isolateModules(() => {
    jest.doMock('../../database/models/keyword', () => ({
      __esModule: true,
      default: { findAll: jest.fn() },
    }));
    jest.doMock('../../utils/searchConsole', () => ({
      __esModule: true,
      readLocalSCData: jest.fn(),
    }));
    const m0 = require('../../utils/domains');
    getdomainStats = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../../database/models/keyword');
    Keyword = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../../utils/searchConsole');
    readLocalSCData = m2.readLocalSCData;
  });

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
      const dayStat = (clicks: number, impressions: number, position: number) => ({ clicks, impressions, ctr: 0, position });
      mockReadLocalSCData.mockResolvedValue({
        stats: [
          ...Array.from({ length: 7 }, () => dayStat(1, 10, 20)), // previous 7 days
          ...Array.from({ length: 7 }, () => dayStat(2, 30, 10)), // current 7 days
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
      const dayStat = { clicks: 1, impressions: 5, ctr: 0, position: 8 };
      mockReadLocalSCData.mockResolvedValue({ stats: Array.from({ length: 10 }, () => dayStat) });

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

  describe('averagePosition', () => {
    describe('summarizeAveragePosition map pack rule', () => {
      // A keyword counted alone: avgPosition is its counted position, 0 when it is left out.
      const counted = (keyword: Record<string, unknown>) => summarizeAveragePosition([keyword], 30).avgPosition;
      const localResults = (spot: number) => JSON.stringify([
        { position: 1, title: 'Other', isOwn: false },
        { position: spot, title: 'Mine', isOwn: true },
      ]);
      const droppedBefore = { '2026-11-01': 5 };

      it('counts the better of the map pack spot and the organic position, ignoring organic 0', () => {
        expect(counted({ position: 1, mapPackTop3: 1, localResults: localResults(3) })).toBe(1);
        expect(counted({ position: 10, mapPackTop3: 1, localResults: localResults(2) })).toBe(2);
        expect(counted({ position: 5, mapPackTop3: 1, localResults: localResults(3) })).toBe(3);
        // Organic 0 is ignored and a keyword with a spot is never penalized
        expect(counted({ position: 0, mapPackTop3: 1, localResults: localResults(2), history: droppedBefore })).toBe(2);
        // Parsed array works the same as the stored JSON string
        expect(counted({ position: 0, mapPackTop3: 1, localResults: JSON.parse(localResults(2)), history: droppedBefore })).toBe(2);
        // Map pack flag off: the spot is not used, the organic rule applies
        expect(counted({ position: 7, mapPackTop3: 0, localResults: localResults(1) })).toBe(7);

        // No spot can be derived (malformed, empty, out of range): the current rule applies
        // Malformed, empty, or out-of-range spot: organic > 0 counts at organic, organic 0 is left out (not penalized)
        expect(counted({ position: 4, mapPackTop3: 1, localResults: '{not json' })).toBe(4);
        expect(counted({ position: 4, mapPackTop3: 1, localResults: '' })).toBe(4);
        expect(counted({ position: 4, mapPackTop3: 1, localResults: '[]' })).toBe(4);
        expect(counted({ position: 4, mapPackTop3: 1, localResults: null })).toBe(4);
        expect(counted({ position: 4, mapPackTop3: 1, localResults: JSON.stringify([{ position: 4, isOwn: true }]) })).toBe(4);
        expect(counted({ position: 0, mapPackTop3: 1, localResults: '[]', history: droppedBefore })).toBe(0);
        expect(counted({ position: 0, mapPackTop3: 1, localResults: 'nope', history: droppedBefore })).toBe(0);
        // Without a map pack flag, a keyword that ranked before and dropped out still takes the penalty
        expect(counted({ position: 0, mapPackTop3: 0, localResults: localResults(2), history: droppedBefore })).toBe(30);
      });
    });

    describe('getUnrankedPenalty', () => {
      it('is 10 points per scraped page: 10 for basic (or no strategy), 30 for custom with 3 pages', () => {
        expect(UNRANKED_PENALTY_PER_PAGE).toBe(10);
        expect(getUnrankedPenalty({ scrape_strategy: 'basic', scrape_pagination_limit: 5 }, null)).toBe(10);
        expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 3 }, null)).toBe(30);
        // Any strategy other than custom counts as basic
        expect(getUnrankedPenalty({ scrape_strategy: 'smart', scrape_pagination_limit: 3 }, null)).toBe(10);
        expect(getUnrankedPenalty({}, {})).toBe(10);
      });

      it('uses the domain strategy and page limit over the global ones, and falls back to 1 page for an unset custom limit', () => {
        // Domain on custom 4 pages overrides a global basic strategy
        expect(getUnrankedPenalty({ scrape_strategy: 'basic' }, { scrape_strategy: 'custom', scrape_pagination_limit: 4 })).toBe(40);
        // Domain on basic overrides a global custom strategy
        expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 3 }, { scrape_strategy: 'basic' })).toBe(10);
        // Custom with no limit anywhere is 1 page (not the scraper's 5)
        expect(getUnrankedPenalty({ scrape_strategy: 'custom' }, { scrape_strategy: 'custom', scrape_pagination_limit: 0 })).toBe(10);
        // Empty domain strategy inherits the global custom strategy and its limit
        expect(getUnrankedPenalty({ scrape_strategy: 'custom', scrape_pagination_limit: 2 }, { scrape_strategy: '' })).toBe(20);
      });
    });
  });
});
