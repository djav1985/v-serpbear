type KeywordRowFixture = {
  ID: number;
  keyword: string;
  device: string;
  country: string;
  domain: string;
  lastUpdated: string;
  added: string;
  position: number;
  volume: number;
  sticky: number | string;
  history: string;
  history7d?: string | null;
  lastResult: string;
  url: string;
  tags: string;
  updating: number | string;
  lastUpdateError: string;
  mapPackTop3: number | string;
};

export const buildKeywordRow = (overrides: Partial<KeywordRowFixture> = {}): KeywordRowFixture => ({
  ID: 1,
  keyword: 'example keyword',
  device: 'desktop',
  country: 'US',
  domain: 'example.com',
  lastUpdated: '2025-01-01T00:00:00.000Z',
  added: '2025-01-01T00:00:00.000Z',
  position: 5,
  volume: 100,
  sticky: 1,
  history: JSON.stringify({ '2025-01-01': 5 }),
  lastResult: JSON.stringify([]),
  url: 'https://example.com/page',
  tags: JSON.stringify(['tag']),
  updating: 0,
  lastUpdateError: 'false',
  mapPackTop3: 0,
  ...overrides,
});
