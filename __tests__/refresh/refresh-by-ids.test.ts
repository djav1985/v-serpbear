/// <reference path="../../types.d.ts" />
import Keyword from '../../database/models/keyword';
import { refreshKeywordsByIds } from '../../utils/refresh';

jest.mock('../../database/models/keyword', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../database/models/domain', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('refreshKeywordsByIds', () => {
  const findAll = Keyword.findAll as unknown as jest.Mock;
  beforeEach(() => { findAll.mockReset(); });

  it('loads the rows when the refresh starts, so it uses their current data', async () => {
    findAll.mockResolvedValue([]);
    await refreshKeywordsByIds([3, 3, 5], { scraper_type: 'serpapi' } as SettingsType);
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findAll.mock.calls[0][0].where.ID).toEqual([3, 5]);
  });

  it('refreshes nothing, and does not query, when no ID is valid', async () => {
    expect(await refreshKeywordsByIds([0, -1, 1.5], { scraper_type: 'serpapi' } as SettingsType)).toEqual([]);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('skips keywords deleted while the task waited', async () => {
    findAll.mockResolvedValue([]);
    expect(await refreshKeywordsByIds([9], { scraper_type: 'serpapi' } as SettingsType)).toEqual([]);
  });
});
