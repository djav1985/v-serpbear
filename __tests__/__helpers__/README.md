# Test Helpers

This directory contains shared test utilities to reduce code duplication across test files.

## Test Suite Layout

The suite was consolidated in November 2026 from 81 files to 26, with no test removed and coverage unchanged or higher.

| Metric | Before | Now |
|--------|--------|-----|
| Test files (suites) | 81 | 26 |
| Tests | 838 (1 failing) | 838 (all passing) |
| Statements covered | 57.1% | 59.3% |
| Lines / branches / functions | 58.3% / 45.1% / 43.2% | 60.3% / 47.0% / 47.0% |

Rules for new tests:

1. Add a test to the file for its topic (below) before creating a new file. Create a new file only for a genuinely new area.
2. Keep each file under roughly 1,500 lines. Past that, split by topic.
3. Every old suite keeps its own `describe` block inside the merged file, so hooks, helpers and environment changes stay scoped to it.
4. Two suites that mock the same module differently cannot share top-level `jest.mock` calls. Put each in its own `describe` and use `jest.isolateModules` with `jest.doMock`, so each loads its own copy of the modules (see `serp-routes.test.ts` and `email-digest.test.ts` for examples).
5. Keep this table up to date when files are added, merged or split.

| File | Covers |
|------|--------|
| `auth.test.ts` | `verifyUser`, login throttle, session store, the session check route |
| `api/login.test.ts` | Login and logout routes |
| `branding.test.ts` | Branding config and the logo route (`/api/images/logo.png`) |
| `api/settings.test.ts` | The settings route (`/api/app/settings`) |
| `serp-routes.test.ts` | Domains, domain and keyword routes, domain stats helpers, keyword meta helpers |
| `keywords-route.test.ts` | The keywords route and keyword parsing |
| `api/keywords.integrity.test.ts` | Keyword data integrity rules on add and update |
| `refresh-route.test.ts` | The refresh route and the retry queue manager |
| `refresh-core.test.ts` | Keyword refresh flow, refresh queue, settings file lock |
| `refresh-stats-and-effects.test.ts` | Domain stats updates and refresh side effects (history trimming, business name) |
| `google-routes.test.ts` | Search Console, Volume, AdWords and Ideas routes, Insight, AdWords idea paths |
| `search-console-and-volume.test.ts` | AdWords volume lookup and Search Console utilities |
| `utils/adwordsKeywordIdeas.test.ts` | Google Ads keyword ideas |
| `email-digest.test.ts` | The digest email route and the `?type=` routing |
| `email-ideas.test.ts` | The keyword ideas email, the email throttle, the email templates |
| `cron-and-mcp.test.ts` | The cron worker and the MCP route |
| `api/cron.test.ts` | The cron route |
| `scraper-core.test.ts` | Shared scraper logic: strategy, pagination, body reading, Google link resolving, map pack marking |
| `scraper-providers.test.ts` | Every provider: URL contract checks for all providers plus provider-specific behaviour |
| `database/db-core.test.ts` | Database init and the SQLite dialect |
| `database/db-migrations.test.ts` | Migrations, including the ones that run in a separate Node process |
| `logging.test.ts` | The logger and API request logging |
| `utils-small.test.ts` | Location, time zone, security, boolean helpers, history date keys, average position, API helpers |
| `client-utils.test.ts` | Client API wrapper, helpers, sorting and filtering, CSV export, chart data, safe URL |
| `frontend.test.ts` | The Tracker and Ideas tables (real columns in a real table) and the thumbnail cache |
| `app/domainSettingsDialog.test.tsx` | The domain settings dialog starting fresh on every open |

### Testing App Router routes

The API lives in `app/api/**/route.ts`. A route tests run for real: it gets a standard `Request` and returns a standard `Response`.

- `asHandler(routeModule)` (in `routeAdapter.ts`) turns a route module into `(req, res)`. It builds a real `Request` from the mock request (`method`, `query`, `body`, `headers`, `url`, `cookies`, and `socket.remoteAddress` as the client address) and writes the `Response` into the mock response (`status`, `json`, `setHeader`, `send`). `asModule` does the same for `require()` inside `jest.isolateModules`.
- `buildRequest(mock)` gives the same real `Request` for helpers that take one (`verifyUser`, `checkApiKey`, `getApiKeyAttemptKeys`).
- `apiLoggingMock()` replaces `utils/apiLogging` in route tests: no request ids, logging, lockout or database check, but the same auth and 405 rules (auth goes through the test's mocked `verifyUser`). The real wrapper is covered in `logging.test.ts`.
- The client address is read from `X-Forwarded-For` only when `TRUST_PROXY` is set, so tests that depend on an address set `TRUST_PROXY = '1'`.
- Under `jest.useFakeTimers()`, pass `{ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }`, or reading a `Response` body never finishes.

### Contract + Delta Pattern

Use the **contract + delta** pattern when multiple implementations share the same interface:

1. **Contract tests** (a `describe.each` over all providers, or helper functions in `__helpers__/`) assert behaviour every implementation must satisfy, such as URL encoding, no `console.log` leakage and the error envelope shape.
2. **Delta tests** assert behaviour unique to one implementation.

`scraper-providers.test.ts` follows this: the shared checks run against every provider, then each provider has its own section.

#### API route example

```typescript
// In each route test – uses shared helpers instead of re-implementing the same assertions:
import { assertUnauthorized, assertMethodNotAllowed } from '../__helpers__';

it('returns 401 when not authorised', async () => {
  verifyUserMock.mockReturnValue('not authorized');
  const req = createMockRequest({ method: 'GET' });
  await assertUnauthorized(handler, req);
});
```

## Available Helpers

### Response & Request Mocks

#### `createMockResponse()`
Creates a mock `NextApiResponse` object for testing API handlers.

```typescript
import { createMockResponse } from '../__helpers__';

const res = createMockResponse();
await handler(req, res);

expect(res.status).toHaveBeenCalledWith(200);
expect(res.json).toHaveBeenCalledWith({ success: true });
```

#### `createMockRequest(overrides?)`
Creates a mock `NextApiRequest` object with optional property overrides.

```typescript
import { createMockRequest } from '../__helpers__';

// Default GET request
const req = createMockRequest();

// Custom request
const postReq = createMockRequest({
  method: 'POST',
  body: { data: 'test' },
  query: { id: '123' }
});
```

### API Route Harness

These helpers eliminate the most frequently duplicated assertions in API route test files.

#### `assertUnauthorized(handler, req)`
Calls `handler` and asserts the response status is 401.

#### `assertMethodNotAllowed(handler, req)`
Calls `handler` and asserts status 405 with `METHOD_NOT_ALLOWED` code.

#### `assertBadRequest(handler, req, expectedCode?)`
Calls `handler` and asserts status 400 with standard error envelope shape.

#### `assertNotFound(handler, req, expectedCode?)`
Calls `handler` and asserts status 404 with `NOT_FOUND` code.

#### `assertErrorShape(body, expectedCode?)`
Asserts that `body` matches `{ error: { code, message } }` shape.

```typescript
import {
  assertUnauthorized,
  assertMethodNotAllowed,
  assertErrorShape,
  createMockRequest,
} from '../__helpers__';

it('returns 401 when not authorised', async () => {
  verifyUserMock.mockReturnValue('not authorized');
  await assertUnauthorized(handler, createMockRequest({ method: 'GET' }));
});

it('returns 405 for wrong method', async () => {
  verifyUserMock.mockReturnValue('authorized');
  await assertMethodNotAllowed(handler, createMockRequest({ method: 'DELETE' }));
});
```

### Scraper Contract Helper

#### `runScraperURLContracts(config)`
Registers shared `it(...)` blocks inside a `describe` block to verify the universal scraper URL-generation contract.

```typescript
import { runScraperURLContracts } from '../__helpers__';

describe('myscraper – URL contract', () => {
  runScraperURLContracts({
    providerName: 'myscraper',
    scrapeURL: myscraper.scrapeURL!,
    settingsFactory: () => ({ scraping_api: 'key' }),
    keywordWithSpaces: { keyword: 'best coffee shops', country: 'US', device: 'desktop' },
    keywordCountryOnly: { keyword: 'coffee', country: 'US', location: 'US', device: 'desktop' },
  });
});
```

See `__tests__/scraper-providers.test.ts` for a full example running the contract across all providers with `describe.each`.

### Common Mock Configurations

These functions provide reusable Jest mock configurations for frequently mocked modules:

- `mockDatabase()` - Database sync mock
- `mockVerifyUser()` - User verification mock
- `mockApiLogging()` - API logging middleware mock
- `mockScrapers()` - Scrapers index mock
- `mockLogger()` - Logger utility mock
- `mockRefresh()` - Refresh utility mock
- `mockDomainModel()` - Domain model with common methods
- `mockKeywordModel()` - Keyword model with common methods

**Note:** These functions cannot be used directly in `jest.mock()` calls due to Jest's hoisting behavior. They are provided as reference implementations. Copy the return value into your test file's mock setup.

## Usage Example

```typescript
import { createMockResponse, createMockRequest } from '../__helpers__';

describe('My API Handler', () => {
  it('should handle requests', async () => {
    const req = createMockRequest({ method: 'POST' });
    const res = createMockResponse();

    await myHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
```

## Benefits

- **Consistency**: All tests use the same mock implementations
- **Maintainability**: Changes to mock structure only need to be made in one place
- **Readability**: Tests are more concise and focused on behaviour
- **Type Safety**: TypeScript types are preserved
- **Coverage guardrails**: `jest.config.js` enforces minimum thresholds for critical paths

## Adding New Helpers

When adding new test helpers:

1. Create the helper function in an appropriate file
2. Export it from `index.ts`
3. Add tests for the helper in the suite that exercises it (there is no separate helper test file)
4. Document it in this README
5. Ensure it follows the existing patterns
