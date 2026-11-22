/**
 * The record schemas (utils/api/contracts/dto.ts) must accept exactly what the server's mappers produce. These tests
 * feed the real mappers rows as the database holds them, awkward ones included (null columns, JSON text), and parse
 * the result with the schemas the browser client uses.
 */
import { endpoints } from '../../utils/api/contracts';
import { DomainDTO, KeywordDTO, SettingsDTO, PublicSettingsDTO, PrivateSettingsDTO } from '../../utils/api/contracts/dto';
import parseKeywords from '../../utils/parseKeywords';
import { maskSecretSettings } from '../../utils/settingsSecrets';
import { buildSettingsDefaults, getAppSettings } from '../../utils/appSettings';
import { loadDomains, loadDomainBySlug } from '../../utils/domainsList';
import { loadDomainKeywords } from '../../utils/keywordsList';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import { readLocalSCData, buildKeywordUid } from '../../utils/searchConsole';
import { getBranding } from '../../utils/branding';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), authEvent: jest.fn() },
}));
jest.mock('../../database/database', () => ({ __esModule: true, default: { sync: jest.fn() } }));
jest.mock('../../database/models/domain', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../database/models/keyword', () => ({ __esModule: true, default: { findAll: jest.fn(), update: jest.fn().mockResolvedValue([1]) } }));
jest.mock('../../utils/searchConsole', () => ({ ...jest.requireActual('../../utils/searchConsole'), readLocalSCData: jest.fn().mockResolvedValue(false) }));
jest.mock('../../utils/appSettings', () => ({
  ...jest.requireActual('../../utils/appSettings'),
  getAppSettings: jest.fn().mockResolvedValue({ scraper_type: 'none' }),
}));
jest.mock('../../utils/scraperCredits', () => ({
  creditKey: jest.fn(), creditsUnitFor: jest.fn(), readScraperCredits: jest.fn().mockResolvedValue({}),
  resolveCreditSource: jest.fn(() => ({ apiKey: '', scraperId: '' })), supportsCredits: jest.fn(() => false),
}));

const row = (plain: Record<string, unknown>) => ({ get: () => plain });

const issues = (result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) => (
  result.success ? [] : (result.error?.issues ?? []).map((issue) => `${issue.path.join('.')}: ${issue.message}`)
);

describe('keyword records', () => {
  const stored = {
    ID: 1, keyword: 'shoes', device: 'desktop', country: 'US', location: '', domain: 'example.com',
    lastUpdated: '2026-11-01T00:00:00.000Z', added: '2026-10-01T00:00:00.000Z', position: 3, volume: 120,
    history: '{"2026-11-01":3}', history7d: null, url: 'https://example.com/shoes', tags: '["a"]',
    lastResult: '[{"position":3,"url":"https://example.com/shoes","title":"Shoes"}]',
    sticky: 1, updating: 0, updatingStartedAt: null, lastUpdateError: 'false', mapPackTop3: 0, localResults: '[]',
  };

  it('accepts a normal keyword row', () => {
    const [keyword] = parseKeywords([stored as unknown as Keyword]);
    expect(issues(KeywordDTO.safeParse(keyword))).toEqual([]);
  });

  it('accepts a keyword row with the empty columns a new, moved or failed keyword has', () => {
    const rows = [
      // Added, never scraped
      { ...stored, lastUpdated: null, url: null, history: '{}', lastResult: '[]', position: 0 },
      // A location change clears lastUpdated; the device and country columns may be empty
      { ...stored, lastUpdated: null, device: null, country: null, location: null },
      // A failed scrape with a stored error
      { ...stored, lastUpdateError: '{"date":"2026-11-02","error":"boom","scraper":"serpapi","code":"E1"}', updating: 1, updatingStartedAt: '2026-11-02T00:00:00.000Z' },
      // Map pack results and a 7 day history
      { ...stored, mapPackTop3: 1, history7d: '{"2026-11-01":3}', localResults: '[{"position":1,"title":"Me","isOwn":true,"extra":"x"}]' },
    ];
    parseKeywords(rows as unknown as Keyword[]).forEach((keyword, index) => {
      expect({ index, issues: issues(KeywordDTO.safeParse(keyword)) }).toEqual({ index, issues: [] });
    });
  });

  describe('as the keyword page loads them (loadDomainKeywords)', () => {
    const tenDays = JSON.stringify(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, '0')}`, i + 1])));
    const rows = [
      stored,
      // A legacy row without a 7 day history: it is cut to seven days and queued for a backfill
      { ...stored, ID: 2, history: tenDays, history7d: null },
      // Never scraped, with empty columns
      { ...stored, ID: 3, lastUpdated: null, url: null, device: null, country: null, location: null, history: '{}', lastResult: '[]', position: 0 },
      { ...stored, ID: 4, lastUpdateError: '{"date":"2026-11-02","error":"boom"}', mapPackTop3: 1, history7d: '{"2026-11-01":3}' },
    ];
    const load = async (settings: Record<string, unknown> = {}, scData: unknown = false) => {
      (Keyword.findAll as jest.Mock).mockResolvedValue(rows.map(row));
      (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'none', ...settings });
      (readLocalSCData as jest.Mock).mockResolvedValue(scData);
      return loadDomainKeywords('example.com');
    };

    it('accepts every keyword, with the stored results left out and the history cut to seven days', async () => {
      const { keywords } = await load();
      keywords.forEach((keyword) => {
        expect({ id: keyword.ID, issues: issues(KeywordDTO.safeParse(keyword)) }).toEqual({ id: keyword.ID, issues: [] });
        expect(keyword.lastResult).toEqual([]);
        expect(Object.keys(keyword.history).length).toBeLessThanOrEqual(7);
      });
      expect(Object.keys(keywords[1].history)).toHaveLength(7);
    });

    it('accepts every keyword with Search Console data merged in', async () => {
      const item = (position: number) => ({ keyword: 'shoes', uid: buildKeywordUid('US', 'desktop', 'shoes'), device: 'desktop', page: 'https://example.com/shoes', country: 'US', clicks: 4, impressions: 90, ctr: 0.044, position });
      const { keywords } = await load(
        { search_console_client_email: 'sc@example.com', search_console_private_key: 'key' },
        { threeDays: [item(3.2)], sevenDays: [item(3.4)], thirtyDays: [item(3.9)], lastFetched: '2026-11-02T00:00:00.000Z', stats: [] },
      );
      keywords.forEach((keyword) => {
        expect({ id: keyword.ID, issues: issues(KeywordDTO.safeParse(keyword)) }).toEqual({ id: keyword.ID, issues: [] });
        expect(keyword.scData).toBeDefined();
      });
      expect(keywords[0].scData?.visits.threeDays).toBe(4);
    });
  });

  it('rejects a keyword that has lost a field', () => {
    const [keyword] = parseKeywords([stored as unknown as Keyword]);
    const { position: _position, ...withoutPosition } = keyword;
    expect(KeywordDTO.safeParse(withoutPosition).success).toBe(false);
    expect(KeywordDTO.safeParse({ ...keyword, sticky: 'yes' }).success).toBe(false);
  });
});

describe('domain records', () => {
  const storedDomain = {
    ID: 1, domain: 'example.com', slug: 'example-com', lastUpdated: '2026-11-01T00:00:00.000Z', added: '2026-10-01T00:00:00.000Z',
    scrapeEnabled: 1, notification_emails: 'a@example.com', search_console: null, avgPosition: 0, mapPackKeywords: 0, keywordsTracked: 0,
    prevKeywordsTracked: null, prevAvgPosition: null, prevMapPackKeywords: null, scraper_settings: null, business_name: null,
    scrape_strategy: '', scrape_pagination_limit: 0,
  };

  const load = async (rows: Record<string, unknown>[], withStats: boolean) => {
    (Domain.findAll as jest.Mock).mockResolvedValue(rows.map(row));
    (Keyword.findAll as jest.Mock).mockResolvedValue([]);
    (readLocalSCData as jest.Mock).mockResolvedValue(false);
    return loadDomains(withStats);
  };

  it.each([false, true])('accepts the domain list as the API returns it (withstats %p)', async (withStats) => {
    const domains = await load([
      storedDomain,
      // A domain whose empty columns were never filled
      { ...storedDomain, ID: 2, domain: 'new.example', slug: 'new-example', lastUpdated: null, added: null, notification_emails: null, scrape_strategy: null, scrape_pagination_limit: null, avgPosition: null, mapPackKeywords: null, keywordsTracked: null },
      // Own scraper settings and a business name
      { ...storedDomain, ID: 3, domain: 'own.example', slug: 'own-example', business_name: 'Own', scrape_strategy: 'custom', scrape_pagination_limit: 3, scraper_settings: JSON.stringify({ scraper_type: 'serpapi' }) },
    ], withStats);
    domains.forEach((domain) => {
      expect({ domain: domain.domain, issues: issues(DomainDTO.safeParse(domain)) }).toEqual({ domain: domain.domain, issues: [] });
    });
  });

  it('accepts a domain read by its slug, as the domain page loads it, and sends the same record as the list', async () => {
    const rowsBySlug = [
      storedDomain,
      { ...storedDomain, ID: 2, domain: 'new.example', slug: 'new-example', lastUpdated: null, added: null, notification_emails: null, scrape_strategy: null, scrape_pagination_limit: null, avgPosition: null, mapPackKeywords: null, keywordsTracked: null },
      { ...storedDomain, ID: 3, domain: 'own.example', slug: 'own-example', business_name: 'Own', scrape_strategy: 'custom', scrape_pagination_limit: 3, scraper_settings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: 'key' }), search_console: JSON.stringify({ property_type: 'domain', url: '', client_email: 'sc@example.com', private_key: 'secret' }) },
    ];
    for (const stored of rowsBySlug) {
      (Domain.findOne as jest.Mock).mockResolvedValue(row(stored));
      const domain = await loadDomainBySlug(stored.slug);
      expect({ slug: stored.slug, issues: issues(DomainDTO.safeParse(domain)) }).toEqual({ slug: stored.slug, issues: [] });
      const [fromList] = await load([stored], false);
      expect(domain).toEqual(fromList);
      expect(JSON.stringify(domain)).not.toContain('secret');
    }
  });

  it('answers null for a slug that is not tracked', async () => {
    (Domain.findOne as jest.Mock).mockResolvedValue(null);
    expect(await loadDomainBySlug('missing')).toBeNull();
  });

  it('rejects a domain that has lost a field', () => {
    expect(DomainDTO.safeParse({ ...storedDomain, slug: undefined }).success).toBe(false);
  });
});

describe('settings records', () => {
  const branding = getBranding();
  const full = { ...buildSettingsDefaults(), version: '6.5.0', timezone: 'UTC', branding, available_scapers: [{ label: 'Own', value: 'own', allowsCity: true }], failed_queue: [1], search_console_integrated: false };

  it('accepts the defaults a fresh install starts with', () => {
    expect(issues(SettingsDTO.safeParse(buildSettingsDefaults()))).toEqual([]);
  });

  it('accepts the private view, with secrets masked', () => {
    const view = maskSecretSettings({ ...full, scraping_api: 'secret', smtp_password: 'secret' } as unknown as Record<string, unknown>);
    expect(issues(PrivateSettingsDTO.safeParse(view))).toEqual([]);
    expect((view as { scraping_api: string }).scraping_api).toBe('true');
  });

  it('returns the Search Console client email in plain text and masks the private key', () => {
    const view = maskSecretSettings({ ...full, search_console_client_email: 'svc@project.iam.gserviceaccount.com', search_console_private_key: 'key' } as unknown as Record<string, unknown>) as { search_console_client_email: string, search_console_private_key: string };
    expect(view.search_console_client_email).toBe('svc@project.iam.gserviceaccount.com');
    expect(view.search_console_private_key).toBe('true');
  });

  it('accepts the public view and nothing less', () => {
    const view = { scraper_type: 'none', available_scapers: [], search_console_integrated: false, version: '6.5.0', timezone: 'UTC', branding };
    expect(issues(PublicSettingsDTO.safeParse(view))).toEqual([]);
    expect(PublicSettingsDTO.safeParse({ ...view, timezone: undefined }).success).toBe(false);
  });

  it('answers a save with the same private view as the GET', () => {
    expect(endpoints['settings.save'].response.shape.settings).toBe(endpoints['settings.private'].response.shape.settings);
  });
});

describe('the last response and request shapes', () => {
  it('describes the volume map and the skipped keywords of a location change', () => {
    const volume = endpoints['volume.update'].response;
    expect(volume.safeParse({ keywords: [], volumes: { 1: 120, 2: 0 } }).success).toBe(true);
    expect(volume.safeParse({ keywords: [], volumes: { 1: 'many' } }).success).toBe(false);
    const update = endpoints['keywords.update'].response;
    expect(update.safeParse({ keywords: [], updatedCount: 1, skipped: ['shoes'] }).success).toBe(true);
    expect(update.safeParse({ keywords: [], updatedCount: 1, skipped: [{ ID: 3 }] }).success).toBe(false);
  });

  it('accepts the settings a form sends back and the ideas the browser emails', () => {
    const save = endpoints['settings.save'].body;
    expect(save.safeParse({ settings: { ...buildSettingsDefaults(), version: '6.5.0', timezone: 'UTC' } }).success).toBe(true);
    const ideas = endpoints['email.ideas'].body;
    expect(ideas.safeParse({ type: 'ideas', domain: 'example.com', keywords: [
      { keyword: 'a', avgMonthlySearches: 10, monthlySearchVolumes: { '2026-1': '10' }, competition: 'LOW', competitionIndex: 5, uid: 'x' },
      { keyword: 'b', monthlySearchVolumes: null, competition: null, competitionIndex: '' },
    ] }).success).toBe(true);
  });
});
