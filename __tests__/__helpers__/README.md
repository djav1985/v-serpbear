# Jest test helpers

Helpers here cover test setup that is shared across suites. Keep scenario data,
mock behavior, and expected results in the suite when they explain what that
test is checking.

## Active helpers

- `createMockRequest(overrides?)` and `createMockResponse()` provide the Pages
  API request and response shapes used by route tests.
- `buildRequest(mock)` converts that request shape into a real web `Request`.
- `asHandler(routeModule)` adapts an App Router module to `(req, res)` for
  existing route tests. `asModule(routeModule)` supports tests that load routes
  in `jest.isolateModules()`.
- `apiLoggingMock()` is used as a `jest.mock()` module factory in route tests.
  It bypasses wrapper infrastructure while preserving route auth and method
  behavior; `logging.test.ts` covers the real wrapper.
- `runScraperURLContracts(config)` registers URL contract tests shared by
  scraper providers. Keep provider-specific behavior in the provider suite.

## Usage

```ts
import { createMockRequest, createMockResponse } from '../__helpers__';
import { asHandler } from '../__helpers__/routeAdapter';
import * as route from '../app/api/serp/keyword/route';

const handler = asHandler(route);
const res = createMockResponse();
await handler(createMockRequest({ method: 'GET', query: { id: '12' } }), res);

expect(res.status).toHaveBeenCalledWith(200);
```

For shared module mocks, call the helper from Jest's mock factory rather than
importing a factory into a top-level `jest.mock()` call:

```ts
jest.mock('../../utils/apiLogging', () =>
  require('../__helpers__/apiLoggingMock').apiLoggingMock()
);
```

Keep helpers small and specific. Add one when multiple suites need the same
stable setup; avoid helpers that hide test inputs or make assertions optional.
