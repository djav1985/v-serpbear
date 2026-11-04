# Test Helpers

This directory contains shared test utilities to reduce code duplication across test files.

## Test Suite Budget

| Metric | Value |
|--------|-------|
| **Baseline (2026-03 pass 1)** | 114 `*.test.*` files |
| **First-pass target** | ≤ 91 files (~20% reduction) |
| **Acceptance criteria** | No meaningful coverage loss; no increase in duplicated setup logic |

Completed passes are tracked in the **Consolidated Suites** table below.

### Budget Rules

1. A new `*.test.*` file may be added only when it tests a genuinely new module or feature that has no natural home in an existing suite.
2. When two or more files share the same mock setup and test different aspects of the same module/feature area, prefer merging them into a `*.behavior.test.ts(x)` file.
3. After each consolidation pass, update the table below and re-verify all tests pass.

---

## Test Suite Structure

Tests are grouped by runtime boundary:

| Directory | Purpose |
|-----------|---------|
| `__tests__/api/` | API route handlers (`pages/api/`) |
| `__tests__/utils/` | Server/shared utility logic |
| `__tests__/utils/client/` | Browser/client utility logic |
| `__tests__/services/` | React Query hooks and service fetch wrappers |
| `__tests__/components/` | UI component behavior |
| `__tests__/scrapers/` | Scraper service URL-generation and extraction logic |

### File Naming Conventions

- **`*.behavior.test.ts(x)`** – broad, thematic suites that consolidate related concerns (preferred for new work)
- **`*.matrix.test.ts`** – parameterized suites using `describe.each` / `it.each` to run shared contract checks across multiple providers
- **`*.test.ts(x)`** – retained for isolated, single-module tests with no overlap

### Contract + Delta Pattern

Use the **contract + delta** pattern when multiple implementations share the same interface:

1. **Contract tests** (`*.matrix.test.ts` or using helper functions in `__helpers__/`) – assert shared behaviour that every implementation must satisfy (e.g., URL encoding, no console.log leakage, standard error envelope shape).
2. **Delta tests** (individual `*.test.ts` files) – assert behaviour that is unique to a specific implementation.

#### Scraper example

```
__tests__/scrapers/
  scrapers.matrix.test.ts   ← contract: runs runScraperURLContracts() against all providers
  providers.delta.test.ts    ← delta:    hasdata, serper, serpapi, serply & searchapi specifics
  ...
```

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

### Merge vs Split Guidelines

**Merge** tests into a single `*.behavior.test.ts` file when:
- Multiple source files test different aspects of the same module or feature area
- Setup (mocks, fixtures) is nearly identical across files
- Total combined line count remains manageable (< ~600 lines)
- Use `describe` blocks to preserve readability within the merged file

**Keep separate** when:
- Modules are genuinely independent (different imports, different mocks)
- The component/module is complex and stateful (tables, forms, multi-step flows)
- The test file already serves a clear, bounded purpose

### Consolidated Suites (Reference)

Each row is an existing suite. Source suites merged into it in earlier passes have been removed, so only the consolidated target and the area it covers are listed.

| Consolidated file | Covers |
|----------|---------|
| `utils/refresh.core.behavior.test.ts` | Keyword refresh flow, sync verification, atomic flag clearing |
| `utils/refresh.side-effects.behavior.test.ts` | Refresh side effects: history trimming, business name, parallel domain stats, override logging |
| `utils/refresh-queue.behavior.test.ts` | Refresh queue behaviour and configuration |
| `utils/searchConsole.behavior.test.ts` | Search Console utils: behaviour, error logging, domain conversion |
| `services/searchConsole-hooks.behavior.test.ts` | Search Console service hooks |
| `utils/client/client-utils.behavior.test.ts` | Chart bounds, validators, helpers, CSV payload formatting and CSV export download |
| `components/common-layout.behavior.test.tsx` | Footer, page loader, spinner message, branding |
| `components/settings/NotificationSettings.test.tsx` | Notification settings, settings scraper reload behaviour, Search Console settings panel |
| `components/ui-primitives.behavior.test.tsx` | Icon, modal, toggle field and toggle styles |
| `components/navigation.behavior.test.tsx` | Sidebar and topbar |
| `utils/api/api.utils.behavior.test.ts` | Request security, boolean query parsing, response helpers, origin normalisation |
| `utils/dbBooleans.test.ts` | Boolean normalisation (extended) |
| `utils/scraper.test.ts` | Country code resolution, error serialisation, SERP domain matching, scraper error extraction (extended) |
| `utils/client/apiClient.test.ts` | Client fetch wrapper error handling (extended) |
| `services/domains.behavior.test.ts` | Domain service: env handling, domain fetch, screenshot cache |
| `services/keywords.behavior.test.ts` | Keyword service: idea fetch and keyword fetch |
| `pages/page-renders.behavior.test.tsx` | Page render checks for the index, research and app shell pages |
| `scrapers/scrapers.matrix.test.ts` | Shared URL-contract checks across all scraper providers |
| `hooks/hooks.behavior.test.tsx` | Branding and domains hooks |

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

See `__tests__/scrapers/scrapers.matrix.test.ts` for a full example running the contract across all providers with `describe.each`.

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
