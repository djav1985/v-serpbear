import { scrapeKeywordSafe, finalizeKeywordUpdate } from '../../utils/refresh';
import { scrapeKeywordFromGoogle } from '../../utils/scraper';

jest.mock('../../utils/scraper', () => ({
  scrapeKeywordFromGoogle: jest.fn(),
}));

const mockScrape = scrapeKeywordFromGoogle as jest.Mock;

describe('scrapeKeywordSafe', () => {
  it('returns data when scraper succeeds', async () => {
    mockScrape.mockResolvedValue({ position: 1 });
    const result = await scrapeKeywordSafe({ keyword: 'k' } as any, {} as any);
    expect(result.data).toEqual({ position: 1 });
    expect(result.error).toBe(false);
  });

  it('captures error field from scraper', async () => {
    mockScrape.mockResolvedValue({ position: 1, error: 'oops' });
    const result = await scrapeKeywordSafe({ keyword: 'k' } as any, {} as any);
    expect(result.data).toEqual({ position: 1, error: 'oops' });
    expect(result.error).toBe('oops');
  });

  it('handles thrown errors', async () => {
    mockScrape.mockRejectedValue(new Error('fail'));
    const result = await scrapeKeywordSafe({ keyword: 'k' } as any, {} as any);
    expect(result.data).toBe(false);
    expect(result.error).toBe('fail');
  });
});

describe('finalizeKeywordUpdate', () => {
  it('updates keyword with error information', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const keyword = { update } as any;
    const settings = { scraper_type: 'mock' } as any;
    await finalizeKeywordUpdate(keyword, 'err', settings);
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.updating).toBe(false);
    const parsed = JSON.parse(arg.lastUpdateError);
    expect(parsed.error).toBe('err');
    expect(parsed.scraper).toBe('mock');
  });

  it('updates keyword without error', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const keyword = { update } as any;
    const settings = { scraper_type: 'mock' } as any;
    await finalizeKeywordUpdate(keyword, false, settings);
    expect(update).toHaveBeenCalledWith({ updating: false });
  });

  it('swallows update errors', async () => {
    const update = jest.fn().mockRejectedValue(new Error('db'));
    const keyword = { update } as any;
    const settings = { scraper_type: 'mock' } as any;
    await expect(finalizeKeywordUpdate(keyword, false, settings)).resolves.toBeUndefined();
  });
});
