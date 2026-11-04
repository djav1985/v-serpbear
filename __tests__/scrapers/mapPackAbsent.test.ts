import serpapi from '../../scrapers/services/serpapi';
import searchapi from '../../scrapers/services/searchapi';
import hasdata from '../../scrapers/services/hasdata';
import serply from '../../scrapers/services/serply';
import valueSerp from '../../scrapers/services/valueserp';
import prismcrawl from '../../scrapers/services/prismcrawl';
import dataforseo from '../../scrapers/services/dataforseo';
import { computeMapPackTop3 } from '../../utils/mapPack';

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Responses for queries where Google shows no map pack: the local section is missing or empty.
const cases: Array<[string, any, any]> = [
  ['serpapi', serpapi, { organic_results: [] }],
  ['searchapi', searchapi, { organic_results: [] }],
  ['hasdata', hasdata, { organicResults: [] }],
  ['serply', serply, { results: [] }],
  ['valueserp', valueSerp, { organic_results: [] }],
  ['prismcrawl', prismcrawl, { data: { content: { results: [], serp_features: [] } } }],
  ['dataforseo', dataforseo, { tasks: [{ status_code: 20000, result: [{ items: [] }] }] }],
];

describe.each(cases)('%s map pack when the response has no local results', (_name, scraper, response) => {
  it('returns no map pack and an empty local list without throwing, on desktop and mobile', () => {
    for (const device of ['desktop', 'mobile']) {
      const extraction = scraper.serpExtractor({
        keyword: { keyword: 'coffee', domain: 'example.com', device },
        response,
        result: undefined,
        settings: { scraping_api: 'key', business_name: 'Acme Coffee' },
      } as any);

      expect(extraction.mapPackTop3).toBe(false);
      expect(extraction.localResults ?? []).toEqual([]);
    }
  });
});

describe('computeMapPackTop3', () => {
  const locals = [
    { position: 1, title: 'Acme Plumbing' },
    { position: 2, title: 'Other Co' },
    { position: 3, title: 'Third Ltd' },
    { position: 4, title: 'Fourth Inc' },
  ];

  it('matches the business name against the top three local results', () => {
    expect(computeMapPackTop3('example.com', locals, 'Acme Plumbing')).toBe(true);
    expect(computeMapPackTop3('example.com', locals, 'Third Ltd')).toBe(true);
  });

  it('ignores case and surrounding whitespace in the name', () => {
    expect(computeMapPackTop3('example.com', locals, '  acme PLUMBING ')).toBe(true);
  });

  it('does not match a business ranked below third', () => {
    expect(computeMapPackTop3('example.com', locals, 'Fourth Inc')).toBe(false);
  });

  it('returns false without a business name, or with no local results', () => {
    expect(computeMapPackTop3('example.com', locals, null)).toBe(false);
    expect(computeMapPackTop3('example.com', [], 'Acme Plumbing')).toBe(false);
    expect(computeMapPackTop3('example.com', undefined, 'Acme Plumbing')).toBe(false);
  });

  it('does not use URLs for matching', () => {
    const withUrl = [{ position: 1, title: 'Other Co', url: 'https://example.com' }];
    expect(computeMapPackTop3('example.com', withUrl, 'Acme Plumbing')).toBe(false);
  });

  it('returns false when the business name is only whitespace', () => {
    const singleLocal = [{ position: 1, title: 'Some Business' }];
    expect(computeMapPackTop3('example.com', singleLocal, '   ')).toBe(false);
  });
});
