export {};

import { getScraperClient, parseScraperResponse } from '../../utils/scraper';
import dataforseo from '../../scrapers/services/dataforseo';
import crazyserp from '../../scrapers/services/crazyserp';

const responseWithText = (status: number, text: string) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => text,
  json: async () => { throw new Error('json() should not be used'); },
}) as unknown as Response;

describe('parseScraperResponse', () => {
  it('parses a JSON body and fills in status and ok when the provider omits them', async () => {
    const parsed = await parseScraperResponse(responseWithText(200, '{"organic_results":[]}'));

    expect(parsed).toEqual({ organic_results: [], status: 200, ok: true });
  });

  it('keeps a non-JSON error body so the error message can show what the server said', async () => {
    const parsed = await parseScraperResponse(responseWithText(502, '<html>Bad gateway from upstream</html>'));

    expect(parsed).toEqual({ status: 502, ok: false, body: '<html>Bad gateway from upstream</html>' });
  });

  it('limits how much of a non-JSON body is kept', async () => {
    const parsed = await parseScraperResponse(responseWithText(500, 'x'.repeat(2000)));

    expect((parsed as { body: string }).body).toHaveLength(500);
  });

  it('fails instead of hanging when the body stalls', async () => {
    jest.useFakeTimers();
    try {
      const stalled = { status: 200, ok: true, text: () => new Promise<string>(() => {}) } as unknown as Response;

      const pending = parseScraperResponse(stalled);
      const assertion = expect(pending).rejects.toThrow('timed out');
      await jest.advanceTimersByTimeAsync(30000);

      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('scraper request cancellation', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('aborts the request when reading its body times out, so the connection is released', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const response = { status: 200, ok: true, text: () => new Promise<string>(() => {}) } as unknown as Response;
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve(response);
    }) as unknown as typeof fetch;
    const scraper = { id: 'test', name: 'Test', website: 'x', scrapeURL: () => 'https://example.test/search', resultObjectKey: 'results' } as any;

    const client = getScraperClient({ keyword: 'a', device: 'desktop', country: 'US' } as any, {} as any, scraper);
    const received = (await client) as Response;
    expect(signal?.aborted).toBe(false);

    const pending = parseScraperResponse(received);
    const assertion = expect(pending).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(30000);
    await assertion;

    expect(signal?.aborted).toBe(true);
  });
});

describe('DataForSEO extractor pagination', () => {
  const serpItems = [
    { type: 'paid', title: 'Ad 1', url: 'https://ad-1.com/' },
    { type: 'paid', title: 'Ad 2', url: 'https://ad-2.com/' },
    { type: 'organic', title: 'R1', url: 'https://r1.com/', rank_absolute: 3 },
    { type: 'organic', title: 'R2', url: 'https://r2.com/', rank_absolute: 4 },
    { type: 'organic', title: 'R3', url: 'https://r3.com/', rank_absolute: 5 },
    { type: 'organic', title: 'R4', url: 'https://r4.com/', rank_absolute: 6 },
    { type: 'organic', title: 'R5', url: 'https://r5.com/', rank_absolute: 7 },
    { type: 'organic', title: 'R6', url: 'https://r6.com/', rank_absolute: 8 },
    { type: 'organic', title: 'R7', url: 'https://r7.com/', rank_absolute: 9 },
    { type: 'organic', title: 'R8', url: 'https://r8.com/', rank_absolute: 10 },
    { type: 'organic', title: 'R9', url: 'https://r9.com/', rank_absolute: 11 },
    { type: 'organic', title: 'R10', url: 'https://r10.com/', rank_absolute: 12 },
    { type: 'organic', title: 'R11', url: 'https://r11.com/', rank_absolute: 13 },
  ];
  const response = { tasks: [{ status_code: 20000, result: [{ items: serpItems }] }] };
  const keyword = { keyword: 'coffee', domain: 'r9.com', country: 'US', device: 'desktop' } as any;

  it('returns only the ranks in the requested page, counting ads in the rank', () => {
    const { organic } = dataforseo.serpExtractor!({
      keyword,
      response,
      result: undefined,
      settings: {} as any,
      pagination: { start: 0, num: 10, page: 1 },
    } as any);

    expect(organic.map((item) => item.position)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('returns the next page by absolute rank instead of slicing the organic list', () => {
    const { organic } = dataforseo.serpExtractor!({
      keyword,
      response,
      result: undefined,
      settings: {} as any,
      pagination: { start: 10, num: 10, page: 2 },
    } as any);

    expect(organic.map((item) => item.position)).toEqual([11, 12, 13]);
  });
});

describe('CrazySERP extractor', () => {
  it('does not throw when the payload is an object without an organic list', () => {
    const extract = () => crazyserp.serpExtractor!({
      keyword: {} as any,
      response: {},
      result: JSON.stringify({ message: 'no results' }),
      settings: {} as any,
    } as any);

    expect(extract()).toEqual({ organic: [], mapPackTop3: false, localResults: [] });
  });

  it('reads the organic list from an object payload', () => {
    const { organic } = crazyserp.serpExtractor!({
      keyword: {} as any,
      response: {},
      result: JSON.stringify({ organic: [{ title: 'A', url: 'https://a.com/', position: 1 }] }),
      settings: {} as any,
    } as any);

    expect(organic).toEqual([{ title: 'A', url: 'https://a.com/', position: 1 }]);
  });
});
