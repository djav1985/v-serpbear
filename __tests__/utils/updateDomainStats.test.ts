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
const mockDomainUpdate = Domain.update as jest.MockedFunction<typeof Domain.update>;

describe('updateDomainStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculates and updates domain stats correctly using SQL aggregation', async () => {
    // Mock the aggregated result from SQL query
    const mockAggregatedStats = {
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
        avgPosition: 10, // Math.round(20/2) = 10
        mapPackKeywords: 2,
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
    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 0,
        mapPackKeywords: 0,
      },
      { where: { domain: 'empty.com' } }
    );
  });

  it('handles keywords with all position 0 (unranked)', async () => {
    const mockAggregatedStats = {
      mapPackKeywords: 1,
      totalPosition: 0,
      positionCount: 0,
    };

    mockKeywordFindOne.mockResolvedValue(mockAggregatedStats as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('unranked.com');

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 0, // No valid positions to average
        mapPackKeywords: 1,
      },
      { where: { domain: 'unranked.com' } }
    );
  });

  it('calculates average position with proper rounding', async () => {
    const mockAggregatedStats = {
      mapPackKeywords: 3,
      totalPosition: 14, // Will result in 14/3 = 4.666...
      positionCount: 3,
    };

    mockKeywordFindOne.mockResolvedValue(mockAggregatedStats as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('example.com');

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 5, // Math.round(14/3) = Math.round(4.666...) = 5
        mapPackKeywords: 3,
      },
      { where: { domain: 'example.com' } }
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
});