import { endpoints } from '../../utils/api/contracts';
import { fail, json, runWithApiContext } from '../../utils/api/http';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), authEvent: jest.fn() },
}));
jest.mock('../../database/init', () => ({ ensureDatabase: jest.fn().mockResolvedValue(undefined) }));
// Every protected route is reached as a signed-in session: the contract is about what comes back, not about who may call
jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(() => 'authorized'),
  hasValidApiKey: jest.fn(() => false),
  hasValidSessionCookie: jest.fn(() => true),
  isBearerAuthorization: jest.fn(() => false),
  verifySessionToken: jest.fn(),
}));

// App routes that answer in the envelope. Protocol and binary routes (MCP, OAuth, images, the Google Ads callback) are not listed.
const APP_ROUTES: Record<string, () => Promise<Record<string, (req: Request) => Promise<Response>>>> = {
  '/api/serp/domains': () => import('../../app/api/serp/domains/route'),
  '/api/serp/domain': () => import('../../app/api/serp/domain/route'),
  '/api/serp/keywords': () => import('../../app/api/serp/keywords/route'),
  '/api/serp/keyword': () => import('../../app/api/serp/keyword/route'),
  '/api/serp/refresh': () => import('../../app/api/serp/refresh/route'),
  '/api/serp/clearfailed': () => import('../../app/api/serp/clearfailed/route'),
  '/api/google/ideas': () => import('../../app/api/google/ideas/route'),
  '/api/google/searchconsole': () => import('../../app/api/google/searchconsole/route'),
  '/api/google/insight': () => import('../../app/api/google/insight/route'),
  '/api/google/volume': () => import('../../app/api/google/volume/route'),
  '/api/app/settings': () => import('../../app/api/app/settings/route'),
  '/api/app/email': () => import('../../app/api/app/email/route'),
  '/api/auth/login': () => import('../../app/api/auth/login/route'),
  '/api/auth/logout': () => import('../../app/api/auth/logout/route'),
  '/api/adwords': () => import('../../app/api/adwords/route'),
};

describe('the response envelope', () => {
  it('json() wraps data as { data, error: null, requestId } and takes the request id of the request being handled', async () => {
    const response = runWithApiContext({ requestId: 'rid-1' }, () => json({ domains: [] }, 201));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { domains: [] }, error: null, requestId: 'rid-1' });
  });

  it('fail() answers { data: null, error: { code, message, details? }, requestId }', async () => {
    const response = fail(409, 'CONFLICT', 'Already tracked', { requestId: 'rid-2' }, ['a.com']);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ data: null, error: { code: 'CONFLICT', message: 'Already tracked', details: ['a.com'] }, requestId: 'rid-2' });
  });
});

describe('every app route', () => {
  const request = (method: string, path: string) => new Request(`http://localhost:3000${path}`, { method });

  it.each(Object.keys(APP_ROUTES))('%s answers an unsupported method (PATCH) with the standard 405 envelope and an Allow header', async (path) => {
    const route = await APP_ROUTES[path]();

    const response = await route.PATCH(request('PATCH', path));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toMatch(/\w/);
    expect(response.headers.get('Allow')).not.toMatch(/PATCH/);
    expect(await response.json()).toMatchObject({ data: null, error: { code: 'METHOD_NOT_ALLOWED', message: expect.any(String) }, requestId: expect.any(String) });
  });

  it('is described by the endpoint map: every endpoint has a handler for its method on its path, and every handler has an endpoint', async () => {
    const defined = new Set<string>();
    for (const endpoint of Object.values(endpoints)) {
      expect(APP_ROUTES[endpoint.path]).toBeDefined();
      defined.add(`${endpoint.method} ${endpoint.path}`);
    }
    for (const path of Object.keys(APP_ROUTES)) {
      const route = await APP_ROUTES[path]();
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const allowed = (await route.PATCH(request('PATCH', path))).headers.get('Allow')?.split(', ') ?? [];
        expect(allowed.includes(method)).toBe(defined.has(`${method} ${path}`));
      }
    }
  });
});

describe('success responses', () => {
  it('never carry an error field: a failure is a 4xx or 5xx through fail()', () => {
    const { readFileSync, readdirSync, statSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); } else if (/\.ts$/.test(name)) { files.push(full); }
    });
    walk(join(process.cwd(), 'app', 'api'));
    walk(join(process.cwd(), 'utils', 'api'));

    // Response.json( belongs to the protocol routes (MCP, OAuth), which keep their own formats
    const offenders = files.filter((file) => /(^|[^\w.])json\(\{[^}]*[^\w]error\s*:/m.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
