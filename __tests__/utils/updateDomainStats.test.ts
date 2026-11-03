import { updateDomainStats } from '../../utils/updateDomainStats';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';

// Mock the database models
jest.mock('../../database/models/keyword');
jest.mock('../../database/models/domain');

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

const mockKeywordFindOne = Keyword.findOne as jest.MockedFunction<typeof Keyword.findOne>;
const mockDomainFindOne = Domain.findOne as jest.MockedFunction<typeof Domain.findOne>;
const mockDomainUpdate = Domain.update as jest.MockedFunction<typeof Domain.update>;

// Stored domain values before the refresh runs (no baseline unless keywordsTracked > 0)
const noBaseline = { avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0 };

describe('updateDomainStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDomainFindOne.mockResolvedValue(noBaseline as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculates and updates domain stats correctly using SQL aggregation', async () => {
    // Mock the aggregated result from SQL query
    const mockAggregatedStats = {
      keywordsTracked: 2,
      mapPackKeywords: 2,
      totalPosition: 20, // 5 + 15
      positionCount: 2,
    };

    mockKeywordFindOne.mockResolvedValue(mockAggregatedStats as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('example.com');

    expect(mockKeywordFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domain: 'example.com' },
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
    mockKeywordFindOne.mockResolvedValue(null);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('empty.com');

    // Should update domain with zero values to maintain consistency
    expect(logger.info).toHaveBeenCalledWith('No keywords found for domain empty.com, updating with zero values');
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
    const mockAggregatedStats = {
      keywordsTracked: 4,
      mapPackKeywords: 1,
      totalPosition: 0,
      positionCount: 0,
    };

    mockKeywordFindOne.mockResolvedValue(mockAggregatedStats as any);
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

  it('calculates average position with proper rounding', async () => {
    const mockAggregatedStats = {
      keywordsTracked: 3,
      mapPackKeywords: 3,
      totalPosition: 14, // Will result in 14/3 = 4.666...
      positionCount: 3,
    };

    mockKeywordFindOne.mockResolvedValue(mockAggregatedStats as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('example.com');

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        avgPosition: 5, // Math.round(14/3) = Math.round(4.666...) = 5
        mapPackKeywords: 3,
      }),
      { where: { domain: 'example.com' } }
    );
  });

  it('saves the previous stored values as the snapshot when a baseline exists', async () => {
    mockDomainFindOne.mockResolvedValue({ avgPosition: 12, mapPackKeywords: 3, keywordsTracked: 5 } as any);
    mockKeywordFindOne.mockResolvedValue({
      keywordsTracked: 6,
      mapPackKeywords: 4,
      totalPosition: 14,
      positionCount: 2,
    } as any);
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
    mockKeywordFindOne.mockResolvedValue({
      keywordsTracked: 2,
      mapPackKeywords: 0,
      totalPosition: 10,
      positionCount: 2,
    } as any);
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

  it('handles database errors gracefully', async () => {
    const error = new Error('Database error');
    mockKeywordFindOne.mockRejectedValue(error);

    await updateDomainStats('error.com');

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to update domain stats for error.com',
      error
    );
    expect(mockDomainUpdate).not.toHaveBeenCalled();
  });

  describe('prev* snapshot only moves when a stat changes', () => {
    const aggregate = { keywordsTracked: 2, mapPackKeywords: 0, totalPosition: 20, positionCount: 2 };

    it('keeps the previous change when a recalculation leaves every stat unchanged', async () => {
      // Stored: 2 keywords, average 10. The previous change was from 3 keywords.
      mockDomainFindOne.mockResolvedValue({ avgPosition: 10, mapPackKeywords: 0, keywordsTracked: 2, prevKeywordsTracked: 3 } as any);
      mockKeywordFindOne.mockResolvedValue(aggregate as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      const payload = mockDomainUpdate.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('prevKeywordsTracked');
      expect(payload).not.toHaveProperty('prevAvgPosition');
      expect(payload).not.toHaveProperty('prevMapPackKeywords');
    });

    it('stores the old values as prev* when a stat changes', async () => {
      mockDomainFindOne.mockResolvedValue({ avgPosition: 10, mapPackKeywords: 0, keywordsTracked: 2 } as any);
      mockKeywordFindOne.mockResolvedValue({ ...aggregate, totalPosition: 30 } as any);
      mockDomainUpdate.mockResolvedValue([1] as any);

      await updateDomainStats('example.com');

      expect(mockDomainUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ avgPosition: 15, prevAvgPosition: 10, prevKeywordsTracked: 2, prevMapPackKeywords: 0 }),
        expect.anything(),
      );
    });
  });
});
