# Test Helpers

This directory contains shared test utilities to reduce code duplication across test files.

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
  serpapi.test.ts            ← delta:    SerpApi-specific URL params & map-pack extraction
  serper.test.ts             ← delta:    Serper-specific location & header logic
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

| New file | Replaces |
|----------|---------|
| `utils/refresh.core.behavior.test.ts` | refresh.test.ts, refresh-sync.test.ts, refresh-atomic-flag-clearing.test.ts |
| `utils/refresh.side-effects.behavior.test.ts` | refresh-history-trim.test.ts, refresh-business-name.test.ts, refresh-parallel-domain-stats.test.ts, refresh-override-logging.test.ts |
| `utils/refresh-queue.behavior.test.ts` | refreshQueue.test.ts, refreshQueue-config.test.ts |
| `utils/searchConsole.behavior.test.ts` | searchConsole.test.ts |
| `services/searchConsole-hooks.behavior.test.ts` | services/searchConsole.test.ts |
| `utils/client/exportcsv.behavior.test.ts` | utils/exportcsv.test.ts, utils/client/exportcsv.test.ts |
| `components/common-layout.behavior.test.tsx` | Footer.test.tsx, PageLoader.test.tsx, SpinnerMessage.test.tsx, Branding.test.tsx |
| `components/settings-panels.behavior.test.tsx` | SearchConsoleSettings.test.tsx, Settings.test.tsx |
| `utils/api/api.utils.behavior.test.ts` | utils/api/isRequestSecure.test.ts, utils/api/parseBooleanQueryParam.test.ts, utils/api/response.test.ts |
| `utils/dbBooleans.test.ts` (extended) | utils/boolean-normalization.test.ts (merged in) |
| `scrapers/scrapers.matrix.test.ts` | shared URL-contract checks previously duplicated across provider files |

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
3. Add tests in `helpers.test.ts`
4. Document it in this README
5. Ensure it follows the existing patterns
