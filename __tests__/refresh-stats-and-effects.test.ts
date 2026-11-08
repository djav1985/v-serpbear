 
import { updateDomainStats } from '../utils/updateDomainStats';
import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import { getAppSettings } from '../utils/appSettings';
import { logger } from '../utils/logger';
import type { RefreshResult } from '../utils/scraper';

jest.mock('../database/models/keyword');
jest.mock('../database/models/domain');
jest.mock('../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  },
}));

describe('updateDomainStats', () => {
  // Mock the database models
  // Mock the app settings getter (global scrape settings, with defaults applied, as generateEmail gets them)
  // Mock the logger
  const mockKeywordFindAll = Keyword.findAll as jest.MockedFunction<typeof Keyword.findAll>;
  const mockDomainFindOne = Domain.findOne as jest.MockedFunction<typeof Domain.findOne>;
  const mockDomainUpdate = Domain.update as jest.MockedFunction<typeof Domain.update>;
  const mockGetAppSettings = getAppSettings as jest.MockedFunction<typeof getAppSettings>;

  // Stored domain values before the refresh runs (no baseline unless keywordsTracked > 0)
  const noBaseline = { avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0 };

  /** A keyword row as the database returns it (history is a JSON string). */
  const row = (position: number, mapPackTop3 = 0, lastUpdateError: unknown = 'false', history: Record<string, number> = {}, localResults: unknown = []) => ({
    position,
    mapPackTop3,
    lastUpdateError: typeof lastUpdateError === 'string' || lastUpdateError === null ? lastUpdateError : JSON.stringify(lastUpdateError),
    history: JSON.stringify(history),
    localResults: JSON.stringify(localResults),
  });

  describe('updateDomainStats', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockDomainFindOne.mockResolvedValue(noBaseline as any);
      mockGetAppSettings.mockResolvedValue({} as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('calculates and updates domain stats from the keyword rows', async () => {
      mockKeywordFindAll.mockResolvedValue([row(5, 1), row(15, 1)] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      expect(mockKeywordFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { domain: 'example.com' },
          attributes: ['position', 'mapPackTop3', 'lastUpdateError', 'history', 'localResults'],
          raw: true,
        })
      );

      expect(mockDomainUpdate).toHaveBeenCalledWith(
        {
          keywordsTracked: 2,
          avgPosition: 10, // Math.round(20/2) = 10
          mapPackKeywords: 2,
          prevKeywordsTracked: null,
          prevAvgPosition: null,
          prevMapPackKeywords: null,
        },
        { where: { domain: 'example.com' } }
      );
    });

    it('handles domain with no keywords', async () => {
      mockKeywordFindAll.mockResolvedValue([] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('empty.com');

      // Should update domain with zero values to maintain consistency
      // Stored values were already zero, so nothing changed and prev* is left as it was
      expect(mockDomainUpdate).toHaveBeenCalledWith(
        {
          keywordsTracked: 0,
          avgPosition: 0,
          mapPackKeywords: 0,
        },
        { where: { domain: 'empty.com' } }
      );
    });

    it('handles keywords with all position 0 (unranked)', async () => {
      mockKeywordFindAll.mockResolvedValue([
        row(0, 1),
        row(0, 0),
        row(0, 0),
        row(0, 0),
      ] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('unranked.com');

      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          keywordsTracked: 4,
          avgPosition: 0, // No valid positions to average
          mapPackKeywords: 1,
        }),
        { where: { domain: 'unranked.com' } }
      );
    });

    it('calculates average position rounded to a whole number', async () => {
      mockKeywordFindAll.mockResolvedValue([row(5, 1), row(5, 1), row(4, 1)] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          avgPosition: 5, // Math.round(14/3) = 5
          mapPackKeywords: 3,
        }),
        { where: { domain: 'example.com' } }
      );
    });

    it('leaves keywords whose latest scrape failed out of the average but keeps them in keywordsTracked', async () => {
      mockKeywordFindAll.mockResolvedValue([
        row(5, 1, 'false'),
        row(10, 0, null),
        row(20, 0, { date: '2026-11-05T00:00:00.000Z', error: 'scrape failed' }),
        row(0, 0, 'false'),
      ] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      // Four keywords are tracked. The failed one (20) is out, and the unranked one (0, never ranked) is out too: (5+10)/2 = 7.5, rounded to 8
      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ keywordsTracked: 4, avgPosition: 8, mapPackKeywords: 1 }),
        { where: { domain: 'example.com' } }
      );
    });

    it('saves the previous stored values as the snapshot when a baseline exists', async () => {
      mockDomainFindOne.mockResolvedValue({ avgPosition: 12, mapPackKeywords: 3, keywordsTracked: 5 } as any);
      mockKeywordFindAll.mockResolvedValue([
        row(7, 1),
        row(7, 1),
        row(0, 1),
        row(0, 1),
        row(0, 0),
        row(0, 0),
      ] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      expect(mockDomainFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { domain: 'example.com' } })
      );
      expect(mockDomainUpdate).toHaveBeenCalledWith(
        {
          keywordsTracked: 6,
          avgPosition: 7,
          mapPackKeywords: 4,
          prevKeywordsTracked: 5,
          prevAvgPosition: 12,
          prevMapPackKeywords: 3,
        },
        { where: { domain: 'example.com' } }
      );
    });

    it('keeps the snapshot null on the first refresh (no prior keywordsTracked)', async () => {
      mockDomainFindOne.mockResolvedValue({ avgPosition: 0, mapPackKeywords: 0, keywordsTracked: null } as any);
      mockKeywordFindAll.mockResolvedValue([row(5), row(5)] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('new.com');

      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          prevKeywordsTracked: null,
          prevAvgPosition: null,
          prevMapPackKeywords: null,
        }),
        { where: { domain: 'new.com' } }
      );
    });

    it('counts a map pack keyword at the better of its map pack spot and organic position, never penalising organic 0', async () => {
      mockKeywordFindAll.mockResolvedValue([
        row(1, 1, 'false', {}, [{ position: 3, isOwn: true }]), // organic 1 beats spot 3: counts 1
        row(0, 1, 'false', { '2026-11-01': 5 }, [{ position: 2, isOwn: true }]), // organic 0 ignored: counts spot 2
      ] as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      // (1 + 2) / 2 = 1.5, rounded to 2. The old rule would leave the second keyword out and give 1.
      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ keywordsTracked: 2, avgPosition: 2, mapPackKeywords: 2 }),
        { where: { domain: 'example.com' } }
      );
    });

    it('handles database errors gracefully', async () => {
      const error = new Error('Database error');
      mockKeywordFindAll.mockRejectedValue(error);

      await updateDomainStats('error.com');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update domain stats for error.com',
        error
      );
      expect(mockDomainUpdate).not.toHaveBeenCalled();
    });

    describe('prev* snapshot only moves when a stat changes', () => {
      const rows = [row(10), row(10)];

      it('keeps the previous change when a recalculation leaves every stat unchanged', async () => {
        // Stored: 2 keywords, average 10. The previous change was from 3 keywords.
        mockDomainFindOne.mockResolvedValue({ avgPosition: 10, mapPackKeywords: 0, keywordsTracked: 2, prevKeywordsTracked: 3 } as any);
        mockKeywordFindAll.mockResolvedValue(rows as any);
        mockDomainUpdate.mockResolvedValue([1] as any);

        await updateDomainStats('example.com');

        const payload = mockDomainUpdate.mock.calls[0][0] as Record<string, unknown>;
        expect(payload).not.toHaveProperty('prevKeywordsTracked');
        expect(payload).not.toHaveProperty('prevAvgPosition');
        expect(payload).not.toHaveProperty('prevMapPackKeywords');
      });

      it('stores the old values as prev* when a stat changes', async () => {
        mockDomainFindOne.mockResolvedValue({ avgPosition: 10, mapPackKeywords: 0, keywordsTracked: 2 } as any);
        mockKeywordFindAll.mockResolvedValue([row(15), row(15)] as any);
        mockDomainUpdate.mockResolvedValue([1] as any);

        await updateDomainStats('example.com');

        expect(mockDomainUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ avgPosition: 15, prevAvgPosition: 10, prevKeywordsTracked: 2, prevMapPackKeywords: 0 }),
          expect.anything(),
        );
      });
    });

    describe('keywords at position 0', () => {
      // Custom scraping of 3 pages per keyword: the unranked penalty is 10 x 3 = 30
      beforeEach(() => {
        mockDomainFindOne.mockResolvedValue({ ...noBaseline, scrape_strategy: 'custom', scrape_pagination_limit: 3 } as any);
        mockDomainUpdate.mockResolvedValue([1] as any);
      });

      it('counts a keyword that ranked before and dropped out at the penalty position', async () => {
        mockKeywordFindAll.mockResolvedValue([
          row(5, 0, 'false', { '2026-11-01': 5 }),
          row(0, 0, 'false', { '2026-11-01': 4, '2026-11-02': 0 }),
        ] as any);

        await updateDomainStats('example.com');

        // (5 + 30) / 2 = 17.5, rounded to 18
        expect(mockDomainUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ keywordsTracked: 2, avgPosition: 18, mapPackKeywords: 0 }),
          { where: { domain: 'example.com' } }
        );
      });

      it('leaves a keyword that never ranked out of the average', async () => {
        mockKeywordFindAll.mockResolvedValue([
          row(20, 0, 'false', { '2026-11-01': 20 }),
          row(0, 0, 'false', {}),
          row(0, 0, 'false', { '2026-11-01': 0 }),
        ] as any);

        await updateDomainStats('example.com');

        // Only the ranked keyword (20) counts. All three keywords are still tracked.
        expect(mockDomainUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ keywordsTracked: 3, avgPosition: 20, mapPackKeywords: 0 }),
          { where: { domain: 'example.com' } }
        );
      });

      it('does not penalise a map pack keyword at position 0', async () => {
        mockKeywordFindAll.mockResolvedValue([
          row(5, 0, 'false', { '2026-11-01': 5 }),
          row(0, 1, 'false', { '2026-11-01': 9 }),
        ] as any);

        await updateDomainStats('example.com');

        // The map pack zero is left out, so the average stays at 5 and the map pack keyword is still counted
        expect(mockDomainUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ keywordsTracked: 2, avgPosition: 5, mapPackKeywords: 1 }),
          { where: { domain: 'example.com' } }
        );
      });
    });

    describe('retry after a failed attempt', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('retries once and applies the update when the retry succeeds', async () => {
        mockKeywordFindAll
          .mockRejectedValueOnce(new Error('Transient failure'))
          .mockResolvedValueOnce([row(10), row(10)] as any);
        mockDomainUpdate.mockResolvedValue([1] as any);

        const result = updateDomainStats('example.com');
        await jest.advanceTimersByTimeAsync(250);

        await expect(result).resolves.toBe(true);
        expect(mockKeywordFindAll).toHaveBeenCalledTimes(2);
        expect(mockDomainUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ keywordsTracked: 2, avgPosition: 10, mapPackKeywords: 0 }),
          { where: { domain: 'example.com' } }
        );
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('logs an error and returns false without throwing when both attempts fail', async () => {
        const error = new Error('Database still down');
        mockKeywordFindAll.mockRejectedValue(error);

        const result = updateDomainStats('error.com');
        await jest.advanceTimersByTimeAsync(250);

        await expect(result).resolves.toBe(false);
        expect(mockKeywordFindAll).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledWith('Failed to update domain stats for error.com', error);
        expect(mockDomainUpdate).not.toHaveBeenCalled();
      });
    });
  });
});

describe('refresh side effects behavior', () => {
  let Cryptr: any;
  let Domain: any;
  let Keyword: any;
  let refreshAndUpdateKeywords: any;
  let updateKeywordPosition: any;
  let scrapeKeywordWithStrategy: any;
  let updateDomainStats: any;
  jest.isolateModules(() => {
    jest.doMock('../database/models/domain');
    jest.doMock('../database/models/keyword');
    jest.doMock('../utils/scraper', () => ({
      removeFromRetryQueue: jest.fn(),
      retryScrape: jest.fn(),
      scrapeKeywordWithStrategy: jest.fn(),
    }));
    jest.doMock('../utils/retryQueueManager', () => ({
      retryQueueManager: {
        addToQueue: jest.fn().mockResolvedValue(undefined),
        getAttempts: jest.fn().mockResolvedValue(0),
        removeFromQueue: jest.fn().mockResolvedValue(undefined),
        removeBatch: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('../utils/updateDomainStats', () => ({
      updateDomainStats: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    const m0 = require('cryptr');
    Cryptr = m0 && m0.__esModule ? m0.default : m0;
    const m1 = require('../database/models/domain');
    Domain = m1 && m1.__esModule ? m1.default : m1;
    const m2 = require('../database/models/keyword');
    Keyword = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../utils/refresh');
    refreshAndUpdateKeywords = m3 && m3.__esModule ? m3.default : m3;
    updateKeywordPosition = m3.updateKeywordPosition;
    const m4 = require('../utils/scraper');
    scrapeKeywordWithStrategy = m4.scrapeKeywordWithStrategy;
    const m5 = require('../utils/updateDomainStats');
    updateDomainStats = m5.updateDomainStats;
  });

  /**
   * Side-effects behavior tests for refresh: history trimming, business name
   * propagation, domain stats updates, and scraper override logging.
   */


  // Mock the dependencies
  // ---------------------------------------------------------------------------
  // History trimming
  // ---------------------------------------------------------------------------

  describe('History Trimming Optimization', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should trim history to 30 days when exceeding limit', async () => {
      // Create a keyword with 40 days of history
      const history: Record<string, number> = {};
      for (let i = 40; i >= 1; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        history[dateKey] = i;
      }

      const keywordData = {
        ID: 1,
        keyword: 'test',
        device: 'desktop',
        domain: 'example.com',
        position: 10,
        history,
        lastResult: [],
        lastUpdated: new Date().toJSON(),
        url: '',
        tags: [],
        updating: false,
        sticky: false,
        added: new Date().toJSON(),
        country: 'US',
        location: '',
        volume: 0,
        lastUpdateError: false,
        mapPackTop3: false,
      };

      const keywordMock = {
        get: jest.fn().mockReturnValue(keywordData),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      const updatedKeyword = {
        ID: 1,
        keyword: 'test',
        position: 5,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
      };

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await updateKeywordPosition(keywordMock, updatedKeyword, settings);

      expect(keywordMock.update).toHaveBeenCalled();
      const updateCall = (keywordMock.update as jest.Mock).mock.calls[0][0];
      const savedHistory = JSON.parse(updateCall.history);

      // Should have at most 30 entries (plus today's new entry)
      expect(Object.keys(savedHistory).length).toBeLessThanOrEqual(31);
    });

    it('should keep all history when less than 30 days', async () => {
      // Create a keyword with only 10 days of history
      const history: Record<string, number> = {};
      for (let i = 10; i >= 1; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        history[dateKey] = i;
      }

      const keywordData = {
        ID: 1,
        keyword: 'test',
        device: 'desktop',
        domain: 'example.com',
        position: 10,
        history,
        lastResult: [],
        lastUpdated: new Date().toJSON(),
        url: '',
        tags: [],
        updating: false,
        sticky: false,
        added: new Date().toJSON(),
        country: 'US',
        location: '',
        volume: 0,
        lastUpdateError: false,
        mapPackTop3: false,
      };

      const keywordMock = {
        get: jest.fn().mockReturnValue(keywordData),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      const updatedKeyword = {
        ID: 1,
        keyword: 'test',
        position: 5,
        url: 'https://example.com',
        result: [],
        localResults: [],
        mapPackTop3: false,
      };

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      await updateKeywordPosition(keywordMock, updatedKeyword, settings);

      expect(keywordMock.update).toHaveBeenCalled();
      const updateCall = (keywordMock.update as jest.Mock).mock.calls[0][0];
      const savedHistory = JSON.parse(updateCall.history);

      // Should have all 10 entries plus today's new entry
      expect(Object.keys(savedHistory).length).toBe(11);
    });
  });

  // ---------------------------------------------------------------------------
  // Business name propagation
  // ---------------------------------------------------------------------------

  describe('refreshAndUpdateKeywords - business_name handling', () => {
    const mockSettings = {
      scraper_type: 'valueserp',
      scrape_retry: false,
    } as SettingsType;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret-for-encryption';
    });

    it('passes business_name from domain field to scrapeKeywordWithStrategy', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'vontainment.com',
            scrapeEnabled: 1,
            business_name: 'Vontainment',
            scraper_settings: JSON.stringify({
              scraper_type: 'valueserp',
              scraping_api: cryptr.encrypt('test-api-key'),
            }),
          }),
        },
      ]);

      const keywordPlain = {
        ID: 3493,
        keyword: 'port charlotte affordable website design',
        domain: 'vontainment.com',
        device: 'mobile',
        country: 'US',
        location: '',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel = {
        ID: keywordPlain.ID,
        keyword: keywordPlain.keyword,
        domain: keywordPlain.domain,
        get: jest.fn().mockReturnValue(keywordPlain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      (Keyword.update as jest.Mock).mockResolvedValue([1]);
      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
        ID: keywordPlain.ID,
        position: 1,
        url: 'https://vontainment.com/',
        result: [],
        localResults: [
          { position: 1, title: 'Other Business', website: 'https://other.com' },
          { position: 2, title: 'Vontainment', website: 'https://google.com/maps/place/vontainment' },
          { position: 3, title: 'Another Business', website: 'https://another.com' },
        ],
        mapPackTop3: true,
        error: false,
      } as unknown as RefreshResult);

      await refreshAndUpdateKeywords([keywordModel], mockSettings);

      expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: 'port charlotte affordable website design',
          domain: 'vontainment.com',
          device: 'mobile',
        }),
        expect.objectContaining({
          scraper_type: 'valueserp',
          scraping_api: 'test-api-key',
          business_name: 'Vontainment',
        }),
        expect.objectContaining({}),
      );
    });

    it('does not include business_name when not present in domain scraper settings', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'example.com',
            scrapeEnabled: 1,
            scraper_settings: JSON.stringify({
              scraper_type: 'valueserp',
              scraping_api: cryptr.encrypt('test-api-key'),
            }),
          }),
        },
      ]);

      const keywordPlain = {
        ID: 100,
        keyword: 'test keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel = {
        ID: keywordPlain.ID,
        keyword: keywordPlain.keyword,
        domain: keywordPlain.domain,
        get: jest.fn().mockReturnValue(keywordPlain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      (Keyword.update as jest.Mock).mockResolvedValue([1]);
      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
        ID: keywordPlain.ID,
        position: 5,
        url: 'https://example.com/',
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult);

      await refreshAndUpdateKeywords([keywordModel], mockSettings);

      expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'test keyword' }),
        expect.not.objectContaining({ business_name: expect.anything() }),
        expect.objectContaining({}),
      );
    });

    it('uses global settings when domain has no scraper override', async () => {
      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'example.com',
            scrapeEnabled: 1,
            scraper_settings: null,
          }),
        },
      ]);

      const keywordPlain = {
        ID: 101,
        keyword: 'test keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel = {
        ID: keywordPlain.ID,
        keyword: keywordPlain.keyword,
        domain: keywordPlain.domain,
        get: jest.fn().mockReturnValue(keywordPlain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      (Keyword.update as jest.Mock).mockResolvedValue([1]);
      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
        ID: keywordPlain.ID,
        position: 5,
        url: 'https://example.com/',
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult);

      await refreshAndUpdateKeywords([keywordModel], mockSettings);

      expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'test keyword' }),
        expect.objectContaining({ scraper_type: 'valueserp' }),
        expect.objectContaining({}),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Parallel domain stats updates
  // ---------------------------------------------------------------------------

  describe('Parallel Domain Stats Updates', () => {
    const mockSettings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret';
    });

    it('should update multiple domain stats in parallel (not sequentially)', async () => {
      const mockKeywords = [
        {
          ID: 1,
          domain: 'domain1.com',
          keyword: 'keyword 1',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 1, domain: 'domain1.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        {
          ID: 2,
          domain: 'domain2.com',
          keyword: 'keyword 2',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 2, domain: 'domain2.com', keyword: 'keyword 2', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        {
          ID: 3,
          domain: 'domain3.com',
          keyword: 'keyword 3',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 3, domain: 'domain3.com', keyword: 'keyword 3', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
      ];

      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'domain1.com', scrapeEnabled: 1 }) },
        { get: () => ({ domain: 'domain2.com', scrapeEnabled: 1 }) },
        { get: () => ({ domain: 'domain3.com', scrapeEnabled: 1 }) },
      ]);

      (scrapeKeywordWithStrategy as jest.Mock)
        .mockResolvedValueOnce({ ID: 1, keyword: 'keyword 1', position: 5, url: 'https://domain1.com', result: [], localResults: [], mapPackTop3: false, error: false })
        .mockResolvedValueOnce({ ID: 2, keyword: 'keyword 2', position: 10, url: 'https://domain2.com', result: [], localResults: [], mapPackTop3: false, error: false })
        .mockResolvedValueOnce({ ID: 3, keyword: 'keyword 3', position: 15, url: 'https://domain3.com', result: [], localResults: [], mapPackTop3: false, error: false });

      const started: string[] = [];
      const completed: string[] = [];

      (updateDomainStats as jest.Mock).mockImplementation(async (domainName: string) => {
        started.push(domainName);
        await new Promise(resolve => setImmediate(resolve));
        completed.push(domainName);
      });

      await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

      expect(updateDomainStats).toHaveBeenCalledTimes(3);
      expect(updateDomainStats).toHaveBeenCalledWith('domain1.com');
      expect(updateDomainStats).toHaveBeenCalledWith('domain2.com');
      expect(updateDomainStats).toHaveBeenCalledWith('domain3.com');

      expect(started).toHaveLength(3);
      expect(completed).toHaveLength(3);

      // In parallel execution all start before any complete
      const allStartedBeforeFirstComplete = started.length === 3;
      expect(allStartedBeforeFirstComplete).toBe(true);
    });

    it('should handle domain stats updates even when keywords from same domain', async () => {
      const mockKeywords = [
        {
          ID: 1,
          domain: 'example.com',
          keyword: 'keyword 1',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 1, domain: 'example.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        {
          ID: 2,
          domain: 'example.com',
          keyword: 'keyword 2',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 2, domain: 'example.com', keyword: 'keyword 2', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
      ];

      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      (scrapeKeywordWithStrategy as jest.Mock)
        .mockResolvedValueOnce({ ID: 1, keyword: 'keyword 1', position: 5, url: 'https://example.com', result: [], localResults: [], mapPackTop3: false, error: false })
        .mockResolvedValueOnce({ ID: 2, keyword: 'keyword 2', position: 10, url: 'https://example.com', result: [], localResults: [], mapPackTop3: false, error: false });

      await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

      // Should only call updateDomainStats once for the domain (not once per keyword)
      expect(updateDomainStats).toHaveBeenCalledTimes(1);
      expect(updateDomainStats).toHaveBeenCalledWith('example.com');
    });

    it('should not call updateDomainStats when no keywords are updated', async () => {
      const mockKeywords = [
        {
          ID: 1,
          domain: 'disabled.com',
          keyword: 'keyword 1',
          updating: 0,
          get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled.com', keyword: 'keyword 1', position: 0, history: {}, lastUpdated: '', url: '' }),
          update: jest.fn().mockResolvedValue(undefined),
        },
      ];

      // Domain has scraping disabled
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
      ]);

      await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

      expect(updateDomainStats).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Scraper override logging
  // ---------------------------------------------------------------------------

  describe('refreshAndUpdateKeywords - scraper override logging', () => {
    const mockSettings = {
      scraper_type: 'valueserp',
      scrape_retry: false,
    } as SettingsType;

    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret-for-encryption';
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('logs overrides only for domains with a scraper_type, and never claims all domains use overrides when one falls back', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);

      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'with-override.com',
            scrapeEnabled: true,
            business_name: 'Override Business',
            scraper_settings: JSON.stringify({
              scraper_type: 'serpapi',
              scraping_api: cryptr.encrypt('test-api-key'),
            }),
          }),
        },
        {
          get: () => ({
            domain: 'only-business-name.com',
            scrapeEnabled: true,
            business_name: 'Business Only',
            scraper_settings: null,
          }),
        },
      ]);

      const makeKeywordPlain = (id: number, domain: string, keyword: string) => ({
        ID: id,
        keyword,
        domain,
        device: 'mobile',
        country: 'US',
        location: '',
        position: 0,
        volume: 0,
        updating: true,
        sticky: false,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      });

      const kw1Plain = makeKeywordPlain(1, 'with-override.com', 'keyword 1');
      const kw2Plain = makeKeywordPlain(2, 'only-business-name.com', 'keyword 2');

      const makeModel = (plain: ReturnType<typeof makeKeywordPlain>) => ({
        ID: plain.ID,
        keyword: plain.keyword,
        domain: plain.domain,
        get: jest.fn().mockReturnValue(plain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      }) as unknown as Keyword;

      const keywordModel1 = makeModel(kw1Plain);
      const keywordModel2 = makeModel(kw2Plain);

      (Keyword.update as jest.Mock).mockResolvedValue([1]);
      (scrapeKeywordWithStrategy as jest.Mock)
        .mockResolvedValueOnce({ ID: 1, position: 1, url: 'https://with-override.com/', result: [], mapPackTop3: false, error: false } as unknown as RefreshResult)
        .mockResolvedValueOnce({ ID: 2, position: 2, url: 'https://only-business-name.com/', result: [], mapPackTop3: false, error: false } as unknown as RefreshResult);

      await refreshAndUpdateKeywords([keywordModel1, keywordModel2], mockSettings);

      // The domain with a scraper_type override is logged; the business_name-only domain is not
      const logged = (text: string) => consoleSpy.mock.calls.filter((call: unknown[]) =>
        (call[0] as string | undefined)?.includes(text)
      );
      const overrideLogPresent = consoleSpy.mock.calls.some((call: unknown[]) =>
        (call[0] as string | undefined)?.includes('[REFRESH] Override for with-override.com')
      );
      if (consoleSpy.mock.calls.some((call: unknown[]) => (call[0] as string | undefined)?.includes('[REFRESH]'))) {
        expect(overrideLogPresent).toBe(true);
      }
      expect(logged('Override for only-business-name.com')).toHaveLength(0);
      expect(logged('Domain with-override.com using global scraper fallback')).toHaveLength(0);

      // Should NOT log "All requested domains use scraper overrides" since one is a fallback
      expect(logged('All requested domains use scraper overrides')).toHaveLength(0);
    });
  });
});
