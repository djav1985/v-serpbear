import { parseBody, parseQuery } from '../../utils/api/validate';

jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());

const get = (query: string) => new Request(`http://localhost/api/test${query}`);
const post = (body?: unknown) => new Request('http://localhost/api/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const thrown = async (work: () => unknown): Promise<{ status: number, code: string, message: string, details?: unknown }> => {
  try { await work(); } catch (error) { return error as { status: number, code: string, message: string, details?: unknown }; }
  throw new Error('Expected the request to be refused');
};

describe('parseQuery', () => {
  it('reads booleans, numbers and lists from the query text', () => {
    expect(parseQuery(get('?withstats=true&domains=a.com,b.com&domains=c.com'), 'domains.list'))
      .toEqual({ withstats: true, domains: ['a.com', 'b.com', 'c.com'] });
    expect(parseQuery(get('?status=retry&id=4,5'), 'refresh.status')).toEqual({ status: 'retry', id: [4, 5] });
    expect(parseQuery(get('?id=12'), 'keywords.get')).toEqual({ id: 12 });
    expect(parseQuery(get('?includePrivate=true'), 'settings.private')).toEqual({ includePrivate: true });
  });

  it.each([
    ['domains.list', '?withstats=sometimes'],
    ['keywords.get', '?id=12abc'],
    ['keywords.get', '?id=1.5'],
    ['keywords.get', '?id=0'],
    ['keywords.get', '?id=9007199254740992'],
    ['keywords.get', ''],
    ['keywords.list', '?domain='],
    ['searchConsole.get', ''],
    ['refresh.status', '?status=retry&id=1,x'],
    ['settings.private', '?includePrivate=yes'],
    ['settings.private', '?includePrivate=false'],
    ['settings.private', ''],
  ] as const)('refuses %s with %s with a 400 that names the field', async (key, query) => {
    const error = await thrown(() => parseQuery(get(query), key));
    expect(error.status).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toMatch(/^Invalid request/);
    expect(Array.isArray(error.details)).toBe(true);
  });
});

describe('parseBody', () => {
  it('returns the parsed body', async () => {
    await expect(parseBody(post({ domains: ['example.com'] }), 'domains.add')).resolves.toEqual({ domains: ['example.com'] });
  });

  it('keeps the unlisted fields of a loose object, such as the Search Console property type', async () => {
    const body = await parseBody(post({ domain: 'example.com', search_console: { client_email: 'a', private_key: 'b', property_type: 'url', url: 'https://example.com/' } }), 'domains.update');
    expect(body.search_console).toEqual({ client_email: 'a', private_key: 'b', property_type: 'url', url: 'https://example.com/' });
  });

  it.each([
    ['domains.add', {}],
    ['domains.add', { domains: [] }],
    ['domains.add', { domains: 'example.com' }],
    ['domains.add', { domains: [3] }],
    ['domains.remove', {}],
    ['domains.update', { scrapeEnabled: true }],
    ['domains.update', { domain: 'example.com', scrape_pagination_limit: '5' }],
    ['keywords.add', { keywords: [] }],
    ['keywords.remove', { ids: [1, 0] }],
    ['keywords.update', { ids: [1] }],
    ['keywords.update', { ids: [1], sticky: true, location: 'x' }],
    ['keywords.update', { ids: [1], sticky: 'true' }],
    ['keywords.update', { ids: [1], tags: [] }],
    ['refresh.start', { ids: [1], domain: 'example.com' }],
    ['refresh.start', { scope: 'domain' }],
    ['refresh.enabledDomains', { scope: 'enabled-domains', ids: [1] }],
    ['refresh.search', { keyword: 'x' }],
    ['ideas.generate', { seedType: 'custom', country: 'USA' }],
    ['ideas.generate', { seedType: 'custom', language: 'en' }],
    ['ideas.generate', {}],
    ['ideas.favorite', {}],
    ['volume.update', { keywords: ['1'] }],
    ['settings.save', {}],
    ['settings.save', { settings: [] }],
    ['settings.save', { settings: { smtp_port: '25' } }],
    ['settings.save', { settings: { scrape_strategy: 'fast' } }],
    ['settings.save', { settings: { keywordsColumns: 'Best' } }],
    ['email.ideas', { type: 'ideas', domain: 'example.com', keywords: [] }],
    ['email.ideas', { type: 'ideas', domain: 'example.com', keywords: [{ avgMonthlySearches: 3 }] }],
    ['email.digest', { type: 'ideas' }],
    ['email.ideas', { type: 'ideas', domain: 'example.com' }],
    ['auth.login', { username: 'a' }],
    ['adwords.test', { developer_token: 'x' }],
  ] as const)('refuses %s with %j with a 400', async (key, body) => {
    const error = await thrown(() => parseBody(post(body), key));
    expect(error.status).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toMatch(/^Invalid request/);
  });

  it('refuses a missing body unless the endpoint allows an empty one', async () => {
    expect((await thrown(() => parseBody(post(), 'searchConsole.refresh'))).status).toBe(400);
    await expect(parseBody(post(), 'clearFailed.run', { emptyBodyOk: true })).resolves.toEqual({});
    await expect(parseBody(post(), 'auth.logout', { emptyBodyOk: true })).resolves.toEqual({});
    await expect(parseBody(post(), 'volume.update', { emptyBodyOk: true })).resolves.toEqual({});
  });

  it('refuses a body that is not JSON', async () => {
    const request = new Request('http://localhost/api/test', { method: 'POST', body: '{nope' });
    expect((await thrown(() => parseBody(request, 'domains.add'))).status).toBe(400);
  });
});

describe('every app route checks its request against the contract', () => {
  const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const root = join(__dirname, '..', '..', 'app', 'api');
  const files: string[] = [];
  const walk = (dir: string) => readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); } else if (name === 'route.ts') { files.push(path); }
  });
  walk(root);

  // Protocol and binary routes own their wire format (MCP, OAuth, images)
  const outside = /[\\/]api[\\/](mcp|oauth|images)[\\/]/;
  const appRoutes = files.filter((file) => !outside.test(file));

  it('finds the app routes', () => {
    expect(appRoutes.length).toBe(15);
  });

  it.each(appRoutes.map((file) => [file.slice(root.length + 1).replace(/\\/g, '/'), file]))('%s reads its input through the contract', (_name, file) => {
    expect(readFileSync(file, 'utf-8')).toMatch(/utils\/api\/validate'|utils\/api\/contracts'/);
  });

  it('leaves the Google OAuth callback alone: the GET handler never reads the contract', () => {
    const source = readFileSync(join(root, 'adwords', 'route.ts'), 'utf-8');
    const callback = source.slice(source.indexOf('const getAdwordsRefreshToken'), source.indexOf('const validateAdwordsIntegration'));
    expect(callback).not.toMatch(/parseBody|parseQuery|endpoints/);
    const begin = source.slice(source.indexOf('const beginAdwordsIntegration'), source.indexOf('const getAdwordsRefreshToken'));
    expect(begin).not.toMatch(/parseBody|parseQuery|endpoints/);
  });
});
