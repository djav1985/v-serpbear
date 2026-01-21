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

const mockKeywordFindAll = Keyword.findAll as jest.MockedFunction<typeof Keyword.findAll>;
const mockDomainUpdate = Domain.update as jest.MockedFunction<typeof Domain.update>;

describe('updateDomainStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculates and updates domain stats correctly', async () => {
    const mockKeywords = [
      {
        get: () => ({
          position: 5,
          mapPackTop3: true,
        }),
      },
      {
        get: () => ({
          position: 15,
          mapPackTop3: false,
        }),
      },
      {
        get: () => ({
          position: 0, // Should be excluded from average
          mapPackTop3: true,
        }),
      },
    ];

    mockKeywordFindAll.mockResolvedValue(mockKeywords as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('example.com');

    expect(mockKeywordFindAll).toHaveBeenCalledWith({ where: { domain: 'example.com' } });
    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 10, // Math.round((5+15)/2) = 10
        mapPackKeywords: 2, // Two keywords have mapPackTop3: true
      },
      { where: { domain: 'example.com' } }
    );
  });

  it('handles domain with no keywords', async () => {
    mockKeywordFindAll.mockResolvedValue([]);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('empty.com');

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 0,
        mapPackKeywords: 0,
      },
      { where: { domain: 'empty.com' } }
    );
  });

  it('handles keywords with all position 0 (unranked)', async () => {
    const mockKeywords = [
      {
        get: () => ({
          position: 0,
          mapPackTop3: false,
        }),
      },
      {
        get: () => ({
          position: 0,
          mapPackTop3: true,
        }),
      },
    ];

    mockKeywordFindAll.mockResolvedValue(mockKeywords as any);
    mockDomainUpdate.mockResolvedValue([1] as any);

    await updateDomainStats('unranked.com');

    expect(mockDomainUpdate).toHaveBeenCalledWith(
      {
        avgPosition: 0, // No valid positions to average
        mapPackKeywords: 1, // One keyword has mapPackTop3: true
      },
      { where: { domain: 'unranked.com' } }
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
});