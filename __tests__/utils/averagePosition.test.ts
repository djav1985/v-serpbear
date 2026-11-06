import { getUnrankedPenalty, summarizeAveragePosition, UNRANKED_PENALTY_PER_PAGE } from '../../utils/averagePosition';

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
