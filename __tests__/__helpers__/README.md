# Test Helpers

This directory contains shared test utilities to reduce code duplication across test files.

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
- **Readability**: Tests are more concise and focused on behavior
- **Type Safety**: TypeScript types are preserved

## Adding New Helpers

When adding new test helpers:

1. Create the helper function in an appropriate file
2. Export it from `index.ts`
3. Add tests in `helpers.test.ts`
4. Document it in this README
5. Ensure it follows the existing patterns
