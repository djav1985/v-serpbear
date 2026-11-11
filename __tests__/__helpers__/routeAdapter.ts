/**
 * Lets a test call an App Router route (a route.ts under app/api) with the request shape the tests already build
 * (`{ method, query, body, headers, url }`) and read the answer through the mock response (`status`, `json`, `send`, `setHeader`).
 * The route itself runs for real: it receives a standard `Request` and returns a standard `Response`.
 *
 *   import * as keywordRoute from '../app/api/serp/keyword/route';
 *   const handler = asHandler(keywordRoute);
 *   await handler(createMockRequest({ method: 'GET', query: { id: '1' } }), createMockResponse());
 */

type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', (req: Request) => Promise<Response> | Response>>;

type MockRequestLike = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  socket?: { remoteAddress?: string };
};

/** Builds a real Request from a mock request object. */
export const buildRequest = (mock: MockRequestLike | any = {}): Request => {
  const method = (mock.method ?? 'GET').toUpperCase();
  const url = new URL(mock.url ?? '/api/test', 'http://localhost:3000');
  Object.entries(mock.query ?? {}).forEach(([key, value]) => {
    if (value === undefined) { return; }
    (Array.isArray(value) ? value : [value]).forEach((item) => url.searchParams.append(key, item));
  });

  const headers = new Headers();
  Object.entries(mock.headers ?? {}).forEach(([key, value]) => {
    if (value === undefined) { return; }
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  });
  // A mock socket address stands in for the proxy header, which is how a route learns the client address (see getClientIp)
  const socketAddress = mock.socket?.remoteAddress;
  if (socketAddress && !headers.has('x-forwarded-for')) { headers.set('x-forwarded-for', socketAddress); }
  if (mock.cookies && Object.keys(mock.cookies).length > 0) {
    headers.set('cookie', Object.entries(mock.cookies).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('; '));
  }

  const hasBody = !['GET', 'HEAD'].includes(method) && mock.body !== undefined && mock.body !== null;
  let body: string | undefined;
  if (hasBody) {
    body = typeof mock.body === 'string' ? mock.body : JSON.stringify(mock.body);
    if (!headers.has('content-type')) { headers.set('content-type', 'application/json'); }
  }
  return new Request(url, { method, headers, body });
};

/** Writes a Response into a mock response, the way the route used to write into the Pages API response. */
const writeResponse = async (response: Response, res: any): Promise<void> => {
  const setHeader = typeof res.setHeader === 'function' ? res.setHeader.bind(res) : () => undefined;
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') { return; }
    setHeader(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length > 0) { setHeader('Set-Cookie', cookies.length === 1 ? cookies[0] : cookies); }
  const text = await response.text();
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    res.json(text ? JSON.parse(text) : null);
  } else {
    if (typeof res.send === 'function') { res.send(text); } else if (typeof res.end === 'function') { res.end(text); }
  }
};

/** Turns a route module into a `(req, res)` function that picks the method export from `req.method`. */
export const asHandler = (route: RouteModule) => async (mockReq: any, res: any): Promise<void> => {
  const method = (mockReq.method ?? 'GET').toUpperCase() as keyof RouteModule;
  // Next answers HEAD from the GET export when a route has no HEAD of its own
  const entry = route[method] ?? (method === ('HEAD' as string) ? route.GET : undefined);
  if (!entry) {
    res.status(405);
    res.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
    return;
  }
  await writeResponse(await entry(buildRequest(mockReq)), res);
};

/** For `require()` in isolated modules: `{ default: handler, ...the route's own exports }`. */
export const asModule = (route: RouteModule) => ({ ...route, __esModule: true, default: asHandler(route) });
