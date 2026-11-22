/**
 * What the server really sends must match the contract the browser checks it with. Only the browser client validates
 * responses at run time, so this runs the real route handlers (and the real mappers) with the data a database holds,
 * awkward rows included, and parses each answer with the schema of its endpoint. An MCP or API key client sees the same bodies.
 */
import { endpoints, type EndpointKey } from '../../utils/api/contracts';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import { getAppSettings, buildSettingsDefaults } from '../../utils/appSettings';
import { readLocalSCData } from '../../utils/searchConsole';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), authEvent: jest.fn() },
}));
jest.mock('../../database/init', () => ({ ensureDatabase: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../database/database', () => ({ __esModule: true, default: { sync: jest.fn() } }));
jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(() => 'authorized'),
  hasValidApiKey: jest.fn(() => false),
  hasValidSessionCookie: jest.fn(() => true),
  isBearerAuthorization: jest.fn(() => false),
  verifySessionToken: jest.fn(),
}));
jest.mock('../../database/models/domain', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../database/models/keyword', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() } }));
jest.mock('../../utils/searchConsole', () => ({
  ...jest.requireActual('../../utils/searchConsole'),
  readLocalSCData: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../utils/appSettings', () => ({
  ...jest.requireActual('../../utils/appSettings'),
  getAppSettings: jest.fn(),
}));
jest.mock('../../utils/scraperCredits', () => ({
  creditKey: jest.fn(), creditsUnitFor: jest.fn(), readScraperCredits: jest.fn().mockResolvedValue({}),
  resolveCreditSource: jest.fn(() => ({ apiKey: '', scraperId: '' })), supportsCredits: jest.fn(() => false),
}));

const row = (plain: Record<string, unknown>) => ({ get: () => plain });

const issues = (result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) => (
  result.success ? [] : (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`)
);

/** Calls a GET endpoint of the contract on its real route and returns the status, the envelope and what its schema says about `data`. */
const get = async (key: EndpointKey, query: Record<string, string> = {}) => {
  const endpoint = endpoints[key];
  const route = await import(`../../app${endpoint.path}/route`) as { GET: (req: Request) => Promise<Response> };
  const url = new URL(`http://localhost:3000${endpoint.path}`);
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await route.GET(new Request(url));
  const body = await response.json() as { data: unknown, error: unknown };
  return { status: response.status, body, issues: issues(endpoint.response.safeParse(body.data)) };
};

// A domain as the database holds it for the first minutes of its life, and one that was filled in over time
const storedDomain = {
  ID: 1, domain: 'example.com', slug: 'example-com', lastUpdated: '2026-11-01T00:00:00.000Z', added: '2026-10-01T00:00:00.000Z',
  scrapeEnabled: 1, notification_emails: 'a@example.com', search_console: null, avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0,
  prevKeywordsTracked: null, prevAvgPosition: null, prevMapPackKeywords: null, scraper_settings: null, business_name: null,
  scrape_strategy: '', scrape_pagination_limit: 0,
};
const emptyDomain = {
  ...storedDomain, ID: 2, domain: 'new.example', slug: 'new-example', lastUpdated: null, added: null, notification_emails: null,
  scrape_strategy: null, scrape_pagination_limit: null, avgPosition: null, mapPackKeywords: null, keywordsTracked: null,
};
const ownSettingsDomain = {
  ...storedDomain, ID: 3, domain: 'own.example', slug: 'own-example', business_name: 'Own', scrape_strategy: 'custom', scrape_pagination_limit: 3,
  scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'encrypted-key' }),
  search_console: JSON.stringify({ property_type: 'domain', url: '', client_email: 'sc@example.com', private_key: 'secret' }),
};

const storedKeyword = {
  ID: 1, keyword: 'shoes', device: 'desktop', country: 'US', location: '', domain: 'example.com',
  lastUpdated: '2026-11-01T00:00:00.000Z', added: '2026-10-01T00:00:00.000Z', position: 3, volume: 120,
  history: '{"2026-11-01":3}', history7d: null, url: 'https://example.com/shoes', tags: '["a"]',
  lastResult: '[{"position":3,"url":"https://example.com/shoes","title":"Shoes"}]',
  sticky: 1, updating: 0, updatingStartedAt: null, lastUpdateError: 'false', mapPackTop3: 0, localResults: '[]',
};

beforeEach(() => {
  jest.clearAllMocks();
  (Domain.findAll as jest.Mock).mockResolvedValue([storedDomain, emptyDomain, ownSettingsDomain].map(row));
  (Keyword.findAll as jest.Mock).mockResolvedValue([]);
  (readLocalSCData as jest.Mock).mockResolvedValue(false);
  (getAppSettings as jest.Mock).mockResolvedValue({
    ...buildSettingsDefaults(), available_scapers: [{ label: 'Own', value: 'own', allowsCity: true }], failed_queue: [], search_console_integrated: false,
  });
});

describe('GET responses match their endpoint schema', () => {
  it.each([[{}], [{ withstats: 'true' }]])('domains.list %j', async (query) => {
    const { status, issues: problems, body } = await get('domains.list', query);
    expect({ status, problems }).toEqual({ status: 200, problems: [] });
    expect((body.data as { domains: unknown[] }).domains).toHaveLength(3);
  });

  it.each([storedDomain, emptyDomain, ownSettingsDomain])('domains.get for the domain $domain, empty columns included', async (stored) => {
    (Domain.findOne as jest.Mock).mockResolvedValue(row(stored));
    const { status, issues: problems } = await get('domains.get', { domain: stored.domain });
    expect({ status, problems }).toEqual({ status: 200, problems: [] });
  });

  it('domains.get sends the same record as the domain list, with the credentials masked', async () => {
    (Domain.findOne as jest.Mock).mockResolvedValue(row(ownSettingsDomain));
    const single = await get('domains.get', { domain: 'own.example' });
    const list = await get('domains.list');
    const fromList = (list.body.data as { domains: { domain: string }[] }).domains.find((domain) => domain.domain === 'own.example');
    expect((single.body.data as { domain: unknown }).domain).toEqual(fromList);
    expect(JSON.stringify(single.body)).not.toContain('secret');
    expect(JSON.stringify(single.body)).not.toContain('encrypted-key');
  });

  it('keywords.list', async () => {
    (Keyword.findAll as jest.Mock).mockResolvedValue([
      storedKeyword,
      { ...storedKeyword, ID: 2, lastUpdated: null, url: null, device: null, country: null, location: null, position: 0, history: '{}' },
      { ...storedKeyword, ID: 3, lastUpdateError: '{"date":"2026-11-02","error":"boom","scraper":"serpapi"}', mapPackTop3: 1 },
      // Legacy row: no 7 day history, more than seven days of full history
      { ...storedKeyword, ID: 4, history: JSON.stringify(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, i + 1]))) },
    ].map(row));
    const { status, issues: problems, body } = await get('keywords.list', { domain: 'example.com' });
    expect({ status, problems }).toEqual({ status: 200, problems: [] });
    expect((body.data as { keywords: unknown[] }).keywords).toHaveLength(4);
  });

  it('keywords.get, found and not found', async () => {
    (Keyword.findOne as jest.Mock).mockResolvedValue(row({ ...storedKeyword, lastUpdated: null, url: null }));
    expect(await get('keywords.get', { id: '1' })).toMatchObject({ status: 200, issues: [] });
    (Keyword.findOne as jest.Mock).mockResolvedValue(null);
    const missing = await get('keywords.get', { id: '99' });
    expect(missing).toMatchObject({ status: 200, issues: [], body: { data: { keyword: null } } });
  });

  it('settings.public and settings.private', async () => {
    expect(await get('settings.public')).toMatchObject({ status: 200, issues: [] });
    expect(await get('settings.private', { includePrivate: 'true' })).toMatchObject({ status: 200, issues: [] });
  });

  it('searchConsole.get and insight.get when Search Console is not connected', async () => {
    (Domain.findOne as jest.Mock).mockResolvedValue(row(storedDomain));
    const searchConsole = await get('searchConsole.get', { domain: 'example.com' });
    expect(searchConsole).toMatchObject({ status: 200, issues: [], body: { data: { integrationStatus: 'not-integrated' } } });
    const insight = await get('insight.get', { domain: 'example.com' });
    expect(insight).toMatchObject({ status: 200, issues: [], body: { data: { integrationStatus: 'not-integrated' } } });
  });
});
