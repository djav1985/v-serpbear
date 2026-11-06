import { readFile } from 'fs/promises';
import generateEmail from '../../utils/generateEmail';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockReadFile = readFile as jest.Mock;

const createSettings = (overrides: Record<string, unknown> = {}) => ({
  search_console_client_email: '',
  search_console_private_key: '',
  keywordsColumns: [],
  scraper_type: 'mock-scraper',
  available_scapers: [
    { label: 'Mock Scraper', value: 'mock-scraper', supportsMapPack: true },
  ],
  ...overrides,
}) as any;

describe('generateEmail', () => {
  it('includes location details in keyword table when provided', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'test keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 5,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        location: 'Berlin,Berlin State,DE',
        mapPackTop3: 1,
      },
    ] as any;

    const settings = createSettings();

    const domain = {
      domain: 'example.com',
      keywordsTracked: 3,
      avgPosition: 2,
      mapPackKeywords: 1,
    } as any;

    const html = await generateEmail(domain, keywords, settings);
    expect(html).toContain('(Berlin, Berlin State)');
    expect(html).toContain('map-pack-flag');
  });

  it('renders a keyword whose country is null instead of throwing', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}{{keywordsTable}}</html>');
    const keywords = [{
      ID: 1, keyword: 'no country', device: 'desktop', country: null, domain: 'example.com',
      lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 5, volume: 0, sticky: false,
      history: {}, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, mapPackTop3: 0,
    }] as any;

    const html = await generateEmail({ domain: 'example.com', keywordsTracked: 1, avgPosition: 5 } as any, keywords, createSettings());

    expect(html).toContain('no country');
  });

  it('separates icons from keyword text into dedicated column', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'very long keyword that might wrap to multiple lines in email',
        device: 'mobile',
        country: 'DE',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 3,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        location: 'Munich,Bavaria,DE',
        mapPackTop3: 1,
      },
    ] as any;

    const settings = createSettings();

    const domain = {
      domain: 'example.com',
      keywordsTracked: 8,
      avgPosition: 4,
      mapPackKeywords: 2,
    } as any;

    const html = await generateEmail(domain, keywords, settings);
    
    // Verify icons are in their own column (first <td>)
    expect(html).toMatch(/<td><span class="flag-stack">.*<\/span><\/td>/);
    
    // Verify keyword text is in separate column (second <td>) with device icon
    expect(html).toMatch(/<td><img class="device".*> very long keyword that might wrap to multiple lines in email<\/td>/);
    
    // Verify location is in third column
    expect(html).toContain('<td>(Munich, Bavaria)</td>');
    
    // Verify map pack flag is included in the icon column
    expect(html).toContain('map-pack-flag');
    expect(html).toContain('MP</span>');
    expect(html).toContain('<span class="mini_stats__label">Keywords</span>');
  });

  it('renders domain tracker summary stats', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'summary keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 7,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
      },
    ] as any;

    const domain = {
      domain: 'example.com',
      keywordsTracked: 15,
      avgPosition: 5,
      mapPackKeywords: 4,
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domain, keywords, settings);

    expect(html).toContain('<span class="mini_stats__badge">Tracker</span>');
    expect(html).toContain('<span class="mini_stats__title">Summary</span>');
    expect(html).toContain('colspan="3"');
    expect(html).toContain('<span class="mini_stats__label">Keywords</span>');
    expect(html).toContain('<span class="mini_stats__value">15</span>');
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">7<\/span>/);
    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">4<\/span>/);
  });

  it('omits the map pack column when the active scraper does not support it', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}{{keywordsTable}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'no map pack keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 10,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
      },
    ] as any;

    const domain = {
      domain: 'example.com',
      keywordsTracked: 9,
      avgPosition: 4,
      mapPackKeywords: 3,
    } as any;

    const settings = createSettings({
      available_scapers: [
        { label: 'Mock Scraper', value: 'mock-scraper', supportsMapPack: false },
      ],
    });

    const html = await generateEmail(domain, keywords, settings);

    expect(html).toContain('colspan="2"');
    expect(html).not.toContain('Map Pack');
  });

  it('calculates tracker summary stats from keywords when domain stats are missing', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'fallback keyword 1',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 3,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 2,
        keyword: 'fallback keyword 2',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 4,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 0,
      },
    ] as any;

    const domain = {
      domain: 'example.com',
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domain, keywords, settings);

    expect(html).toMatch(/<span class="mini_stats__label">Keywords<\/span>\s*<span class="mini_stats__value">2<\/span>/);
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">4<\/span>/);
    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">1<\/span>/);
  });

  it('calculates tracker summary stats excluding unranked and failed keywords from the average when domain stats are missing', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'ranked keyword 1',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 5,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 2,
        keyword: 'not ranked keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 0, // Not ranked
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 0,
      },
      {
        ID: 3,
        keyword: 'ranked keyword 2',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 10,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 4,
        keyword: 'failed scrape keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 30, // Kept from the last good scrape, but the latest scrape failed
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: { date: new Date().toJSON(), error: 'scrape failed' },
        mapPackTop3: 0,
      },
    ] as any;

    const domain = {
      domain: 'example.com',
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domain, keywords, settings);

    // The failed keyword is still tracked, but it is left out of the average: (5+10)/2 = 7.5, rounded to 8
    expect(html).toMatch(/<span class="mini_stats__label">Keywords<\/span>\s*<span class="mini_stats__value">4<\/span>/);
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">8<\/span>/);
    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">2<\/span>/);
  });

  it('simulates real notification scenario with domain object from database (no computed stats)', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');

    // Simulate keywords with real positions (like would come from notification API)
    const keywords = [
      {
        ID: 1,
        keyword: 'real keyword 1',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 8,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 2,
        keyword: 'real keyword 2',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 12,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 0,
      },
    ] as any;

    // Simulate domain object that comes directly from database (no computed stats)
    const domainFromDB = {
      domain: 'example.com',
      slug: 'example-com',
      notification: true,
      notification_emails: 'test@example.com',
      lastUpdated: new Date().toISOString(),
      added: new Date().toISOString(),
      // Note: NO keywordsTracked, avgPosition, or mapPackKeywords properties
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domainFromDB, keywords, settings);

    // Should show correct fallback calculations
    expect(html).toMatch(/<span class="mini_stats__label">Keywords<\/span>\s*<span class="mini_stats__value">2<\/span>/);
    // Average should be (8+12)/2 = 10
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">10<\/span>/);
    // Map pack should be 1 (only first keyword has mapPackTop3: 1)
    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">1<\/span>/);
  });

  it('prefers persisted map pack stat when available even if zero', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'good position keyword 1',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 5,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 2,
        keyword: 'good position keyword 2',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 15,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
    ] as any;

    // Domain with persisted stats: keywordsTracked should be respected, avgPosition recalculated,
    // and mapPackKeywords should use the persisted value even if zero.
    const domainWithStaleStats = {
      domain: 'example.com',
      keywordsTracked: 50, // This is kept as-is (keywords count uses domain stat when available)
      avgPosition: 0,
      mapPackKeywords: 0,
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domainWithStaleStats, keywords, settings);

    // Should calculate avgPosition from keywords, but keep keywordsTracked and map pack from domain
    expect(html).toMatch(/<span class="mini_stats__label">Keywords<\/span>\s*<span class="mini_stats__value">50<\/span>/);
    // Average should be (5+15)/2 = 10, NOT the domain's avgPosition: 0
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">10<\/span>/);
    // Map pack should use persisted domain value of 0 despite keywords suggesting 2
    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">0<\/span>/);
  });

  it('falls back to keyword-derived map pack count when persisted value is not finite', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');

    const keywords = [
      {
        ID: 1,
        keyword: 'invalid persisted stat keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 6,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 1,
      },
      {
        ID: 2,
        keyword: 'second keyword',
        device: 'desktop',
        country: 'US',
        domain: 'example.com',
        lastUpdated: new Date().toISOString(),
        added: new Date().toISOString(),
        position: 9,
        volume: 0,
        sticky: false,
        history: {},
        lastResult: [],
        url: '',
        tags: [],
        updating: false,
        lastUpdateError: false,
        mapPackTop3: 0,
      },
    ] as any;

    const domainWithInvalidPersistedStat = {
      domain: 'example.com',
      keywordsTracked: 2,
      avgPosition: 8,
      mapPackKeywords: Number.NaN,
    } as any;

    const settings = createSettings();

    const html = await generateEmail(domainWithInvalidPersistedStat, keywords, settings);

    expect(html).toMatch(/<span class="mini_stats__label">Map Pack<\/span>\s*<span class="mini_stats__value">1<\/span>/);
  });

  it('does not expand tokens that appear inside keyword text', async () => {
    mockReadFile.mockResolvedValue('<html><body>{{keywordsTable}}|{{domainName}}</body></html>');
    const keyword = {
      ID: 1, keyword: '{{domainName}} {{SCStatsTable}} secret', device: 'desktop', country: 'US', domain: 'example.com',
      lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 3, volume: 0, sticky: false,
      history: {}, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, location: '', mapPackTop3: 0,
    } as any;
    const domain = { ID: 1, domain: 'example.com', slug: 'example-com', scrapeEnabled: true } as any;

    const html = await generateEmail(domain, [keyword], createSettings());

    // The keyword text is escaped and kept as text, not re-expanded
    expect(html).toContain('{{domainName}} {{SCStatsTable}} secret');
    // The domain name is filled in only where the template asks for it
    expect(html.endsWith('|example.com</body></html>')).toBe(true);
  });

  it('shows the same average as updateDomainStats for the same keywords and scrape settings', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');
    // Same rows as the updateDomainStats test "counts a keyword that ranked before and dropped out": a domain on custom
    // scraping of 3 pages (penalty 30) overrides the global basic strategy, so (5 + 30) / 2 = 17.5 rounds to 18
    const keywords = [
      {
        ID: 1, keyword: 'ranked', device: 'desktop', country: 'US', domain: 'example.com', location: '',
        lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 5, volume: 0, sticky: false,
        history: { '2026-11-01': 5 }, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, mapPackTop3: 0,
      },
      {
        ID: 2, keyword: 'dropped out', device: 'desktop', country: 'US', domain: 'example.com', location: '',
        lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 0, volume: 0, sticky: false,
        history: { '2026-11-01': 4, '2026-11-02': 0 }, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, mapPackTop3: 0,
      },
    ] as any;
    const domain = { domain: 'example.com', scrape_strategy: 'custom', scrape_pagination_limit: 3 } as any;

    const html = await generateEmail(domain, keywords, createSettings({ scrape_strategy: 'basic' }));

    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">18<\/span>/);
  });

  it('counts a map pack keyword at its spot when its organic position is 0 (same rule as updateDomainStats)', async () => {
    mockReadFile.mockResolvedValue('<html>{{domainStats}}</html>');
    const keywords = [
      {
        ID: 1, keyword: 'map pack spot two', device: 'desktop', country: 'US', domain: 'example.com', location: '',
        lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 0, volume: 0, sticky: false,
        history: { '2026-11-01': 7 }, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, mapPackTop3: 1,
        // Stored as the JSON string that updateDomainStats reads; parseKeywords hands it over as an array
        localResults: JSON.stringify([{ position: 1, title: 'Rival', isOwn: false }, { position: 2, title: 'Mine', isOwn: true }]),
      },
      {
        ID: 2, keyword: 'organic six', device: 'desktop', country: 'US', domain: 'example.com', location: '',
        lastUpdated: new Date().toISOString(), added: new Date().toISOString(), position: 6, volume: 0, sticky: false,
        history: {}, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false, mapPackTop3: 0,
      },
    ] as any;

    const html = await generateEmail({ domain: 'example.com' } as any, keywords, createSettings());

    // (2 + 6) / 2 = 4. Organic 0 is not penalized for a keyword with a map pack spot.
    expect(html).toMatch(/<span class="mini_stats__label">Avg position<\/span>\s*<span class="mini_stats__value">4<\/span>/);
  });
});
