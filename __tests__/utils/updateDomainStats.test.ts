import { updateDomainStats } from '../../utils/updateDomainStats';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from '../../utils/appSettings';

// Mock the database models
jest.mock('../../database/models/keyword');
jest.mock('../../database/models/domain');

// Mock the app settings getter (global scrape settings, with defaults applied, as generateEmail gets them)
jest.mock('../../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  },
}));

import { logger } from '../../utils/logger';

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
