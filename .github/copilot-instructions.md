# SerpBear AI Development Guide

> Comprehensive guide for AI agents working on the SerpBear SERP tracking application.

## Architecture Overview

### Stack & Core Components
- **Next.js 15** app with UI + REST API (pages router) in [pages/](pages/)
- **SQLite** via Sequelize with custom better-sqlite3 dialect ([database/sqlite-dialect.js](database/sqlite-dialect.js))
- **Background worker** ([cron.js](cron.js)) drives scraping, retries, Search Console refresh, and email digests
- **Scraper integrations** in [scrapers/](scrapers/) with per-domain overrides
- **Settings** encrypted in `data/settings.json` using `Cryptr(SECRET)` and accessed via settings API

### Key Data Flows

**Keyword Position Tracking:**
```
Domain → Keywords → Scheduled scrapes (cron) → History updates → Notifications
```
See [utils/refresh.ts](utils/refresh.ts) and [cron.js](cron.js).

**Authentication & API:**
- JWT tokens + `verifyUser` middleware for API routes ([utils/verifyUser.ts](utils/verifyUser.ts))
- All API handlers wrapped with `withApiLogging` ([utils/apiLogging.ts](utils/apiLogging.ts))
- Standard response pattern: check auth → validate input → query DB → return JSON

**Search Console Integration:**
- Credentials from settings or env (`SEARCH_CONSOLE_*`)
- Refresh orchestrated in cron worker
- OAuth flow managed in [services/searchConsole.ts](services/searchConsole.ts)

**Email Notifications:**
- Templates in [email/](email/)
- Generation logic in [utils/generateEmail.ts](utils/generateEmail.ts) and [utils/generateKeywordIdeasEmail.ts](utils/generateKeywordIdeasEmail.ts)
- Throttling via [utils/emailThrottle.ts](utils/emailThrottle.ts)

---

## Development Setup

### Requirements
- **Node.js 20.18.1** per `.nvmrc` (Node 18 is unsupported)
- SQLite database file: `./data/database.sqlite`

### Commands
```bash
npm ci                    # Install dependencies (preferred over npm install)
npm run db:migrate        # Run database migrations
npm run dev               # Start Next.js dev server (port 3000)
npm run cron              # Start background worker
npm run start:all         # Start both web + cron (uses concurrently)
npm test                  # Run Jest test suite
npm run lint              # ESLint check
npm run lint:css          # Stylelint check
```

### Docker Setup
- Migrations run automatically in [entrypoint.sh](entrypoint.sh)
- Environment variables loaded from `.env`

---

## Database Layer

### Custom SQLite Dialect

**Implementation:** [database/sqlite-dialect.js](database/sqlite-dialect.js)
- Wraps synchronous `better-sqlite3` API for Sequelize compatibility
- **WAL mode** enabled (`journal_mode = WAL`) for concurrent read/write
- **Busy timeout:** 5 seconds to prevent immediate lock failures
- **Boolean coercion:** Auto-converts JS `boolean` ↔ SQLite `1/0`
- **Connection caching:** Singleton pattern for same database file

### Models

**Domain** ([database/models/domain.ts](database/models/domain.ts)):
- `ID`: Auto-increment primary key
- `domain`, `slug`: Unique identifiers
- `scrapeEnabled`: Integer (0/1, not boolean)
- `tags`, `scraper_settings`: JSON stored as TEXT
- `search_console`: Encrypted JSON string
- Timestamps: `lastUpdated`, `added` (ISO string format)

**Keyword** ([database/models/keyword.ts](database/models/keyword.ts)):
- `ID`: Auto-increment PK
- `domain`: String link to domains (no FK constraint)
- `keyword`, `device`, `country`, `location`: Identifying tuple
- `history`, `localResults`, `lastResult`: JSON as STRING
- `position`, `volume`: Numeric rankings
- `sticky`, `updating`: Integer booleans

### Critical Database Gotchas

| Issue | Solution |
|-------|----------|
| **Booleans are integers** | Use `toDbBool()` / `fromDbBool()` from [utils/dbBooleans.ts](utils/dbBooleans.ts) |
| **JSON fields as TEXT** | Must `JSON.stringify()` on write, `JSON.parse()` on read |
| **Plain objects required** | Always call `.get({ plain: true })` before API responses |
| **No FK constraints** | Relationships enforced in app code via `where: { domain: string }` |
| **Encrypted fields** | Use Cryptr for settings; handle decrypt errors gracefully |

### Migration Patterns

**Structure** ([database/migrations/](database/migrations/)):
- Timestamp-based naming: `[timestamp]-[description].js`
- Managed by Umzug v3
- **Must check table existence** before alterations
- **Always use transactions**: `queryInterface.sequelize.transaction(async (t) => {...})`
- Both `up` and `down` required and reversible

**Example patterns:**
```javascript
// Check table existence
const [results] = await queryInterface.sequelize.query(
  `SELECT name FROM sqlite_master WHERE type='table' AND name='keyword'`,
  { transaction: t }
);
if (results.length === 0) {
  console.log('Table does not exist yet, skipping migration');
  return;
}

// Add column with transaction
await queryInterface.addColumn('keyword', 'newField', {
  type: Sequelize.STRING,
  allowNull: true,
  defaultValue: null,
}, { transaction: t });
```

---

## Scraper Architecture

### Service Structure

**Registry:** [scrapers/index.ts](scrapers/index.ts) exports array of all scrapers:
- SerpApi, SearchApi, Serper, ValueSerp, SpaceSerp
- ScrapingAnt, ScrapingRobot, HasData, CrazyScraper
- Proxy (direct Google scraping via HTTPS proxy)

**Interface:** [types.d.ts](types.d.ts) defines `ScraperSettings`:
```typescript
interface ScraperSettings {
  id: string                    // Unique identifier
  name: string                  // Display name
  website: string               // Service website
  resultObjectKey: string       // Response key for results
  allowsCity?: boolean          // City-level location support
  supportsMapPack?: boolean     // Map pack detection
  nativePagination?: boolean    // Handles pagination internally
  
  scrapeURL?(keyword, settings, countries): string    // API URL builder
  headers?(keyword, settings): Object                 // Custom headers
  serpExtractor?(content): Object                     // Result extraction
}
```

### Per-Domain Scraper Settings

**Storage:** `Domain.scraper_settings` JSON column
```typescript
type DomainScraperSettings = {
  scraper_type?: string | null      // Override scraper (e.g., "serpapi")
  scraping_api?: string | null      // Encrypted API key override
  scrape_strategy?: 'basic'|'custom'|'smart'
  scrape_pagination_limit?: number
  scrape_smart_full_fallback?: boolean
}
```

**Management utilities:** [utils/domainScraperSettings.ts](utils/domainScraperSettings.ts)
- `parseDomainScraperSettings()` - Parse raw JSON to typed object
- `maskDomainScraperSettings()` - Mask API keys for frontend
- `buildPersistedScraperSettings()` - Encrypt API keys for storage
- `decryptDomainScraperSettings()` - Decrypt at runtime

**Resolution:** Domain settings override global settings ([utils/refresh.ts](utils/refresh.ts))

### Scraping Strategies

| Strategy | Pages Scraped | Use Case |
|----------|---------------|----------|
| `basic` | Page 1 only | Fast, top 10 results |
| `custom` | 1 to N pages | Fixed depth scraping |
| `smart` | Pages 1 + neighbors around last position | Efficient position tracking |
| `smart + full_fallback` | Smart, then all if not found | Ensure finding even if moved far |

### Error Handling & Retries

**Multi-layer strategy:**
1. **Per-request backoff** ([utils/scraper.ts](utils/scraper.ts)): Exponential with jitter (max 30s)
2. **Per-keyword retries**: Up to 3 attempts per scrape
3. **Failed queue** ([utils/retryQueueManager.ts](utils/retryQueueManager.ts)): File-based queue with locking
4. **Cron retry job**: Hourly retry of failed keywords (configurable)

**State tracking:**
- `markKeywordsAsUpdating()` - Sets `updating: true`, `updatingStartedAt: now`
- `clearKeywordUpdatingFlags()` - Clears on completion, sets `lastUpdateError` if failed

### Implementing New Scrapers

**Steps:**
1. Create service file in [scrapers/services/](scrapers/services/)
2. Define `ScraperSettings` object with required properties
3. Implement `scrapeURL()` - Build API URL with country/device/location handling
4. Implement `headers()` - Return auth headers (API keys from settings)
5. Implement `serpExtractor()` - Parse response and extract results
6. Register in [scrapers/index.ts](scrapers/index.ts)

**Example structure:**
```typescript
const myService: ScraperSettings = {
  id: 'my-service',
  name: 'My Scraper',
  website: 'example.com',
  resultObjectKey: 'organic_results',
  allowsCity: true,
  
  scrapeURL: (keyword, settings, countries) => {
    const country = resolveCountryCode(keyword.country, countries);
    return `https://api.example.com/search?q=${encodeURIComponent(keyword.keyword)}&country=${country}`;
  },
  
  headers: (keyword, settings) => ({
    'X-API-Key': settings.scraping_api,
  }),
  
  serpExtractor: ({ result, response, keyword, settings }) => {
    const results = response.organic_results.map(item => ({
      title: item.title,
      url: item.link,
      position: item.position,
    }));
    return { organic: results, mapPackTop3: false };
  },
};
```

---

## Testing Patterns

### Framework
- **Jest** with **happy-dom** (lightweight virtual DOM)
- Config: [jest.config.js](jest.config.js)
- Setup: [jest.setup.js](jest.setup.js) (polyfills for TextEncoder, fetch, window globals)

### Test Helpers

**Always use these** ([__tests__/__helpers__/](__tests__/__helpers__/)):
- `createMockRequest(overrides)` - Creates NextApiRequest mock
- `createMockResponse()` - Creates NextApiResponse mock with chainable methods

**Reference patterns** (in [__tests__/__helpers__/commonMocks.ts](__tests__/__helpers__/commonMocks.ts)):
- DO NOT call these functions in `jest.mock()` directly (Jest hoisting issue)
- Copy their return values inline instead

### API Route Testing Pattern

**Standard structure:**
```typescript
// 1) Mock dependencies at top (before imports)
jest.mock('../../utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
}));

// 2) Import and cast to typed mocks
import handler from '../../pages/api/domains';
import verifyUser from '../../utils/verifyUser';
const verifyUserMock = verifyUser as jest.Mock;

// 3) Test structure
describe('GET /api/domains', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authorized', async () => {
    verifyUserMock.mockReturnValue('not authorized');
    const req = createMockRequest({ method: 'GET' });
    const res = createMockResponse();
    
    await handler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

### Database Mocking

**Model instances:**
```typescript
const DomainMock = Domain as unknown as {
  findAll: jest.Mock;
  findOne: jest.Mock;
};

// Mock returns instances with .get() method
DomainMock.findAll.mockResolvedValue([
  {
    get: jest.fn().mockReturnValue({
      ID: 1,
      domain: 'example.com',
      scrapeEnabled: 1,
    }),
  },
]);
```

### Common Gotchas

1. **Environment variables:** Save/restore in afterEach
2. **Module reset:** Use `jest.resetModules()` if testing different settings
3. **Boolean fields:** Remember DB returns 0/1, not true/false
4. **Chained responses:** `res.status.mockReturnThis()` for `res.status(200).json({})`
5. **Clear mocks:** Always `jest.clearAllMocks()` in beforeEach

### Standard Test Coverage

For each API route, test:
- ✓ 401 when not authorized
- ✓ 405 for wrong HTTP method
- ✓ 400 for missing/invalid params
- ✓ 404 when resource not found
- ✓ 200/201 for success cases
- ✓ Error handling (database errors, validation errors)

---

## Coding Conventions

### API Routes
- **Pattern:** `withApiLogging` → `verifyUser` → validate input → query DB → respond
- **Error handling:** Consistent status codes and error messages
- **Example:** [pages/api/domain.ts](pages/api/domain.ts)

### Domain Settings
- **Masking:** Use [utils/domainScraperSettings.ts](utils/domainScraperSettings.ts) helpers
- **Encryption:** Apply Cryptr to API keys before persistence
- **Decryption:** Handle errors gracefully (return empty/default on decrypt failure)

### React Components
- **Icons:** Register in [components/common/Icon.tsx](components/common/Icon.tsx)
- **Hooks:** Custom hooks in [hooks/](hooks/)
- **Services:** Client-side API calls in [services/](services/)

### Linting Rules
- **No trailing commas** in config files (enforced by ESLint)
- **Import order:** Group by external, internal, relative
- **Security:** Follow eslint-plugin-security recommendations

---

## Critical Files Reference

### Configuration
- [next.config.js](next.config.js) - Next.js configuration
- [jest.config.js](jest.config.js) - Test configuration
- [eslint.config.mjs](eslint.config.mjs) - Linting rules
- [tailwind.config.js](tailwind.config.js) - Styling configuration

### Core Utilities
- [utils/refresh.ts](utils/refresh.ts) - Keyword refresh orchestration
- [utils/scraper.ts](utils/scraper.ts) - Scraper client and retry logic
- [utils/verifyUser.ts](utils/verifyUser.ts) - JWT authentication
- [utils/apiLogging.ts](utils/apiLogging.ts) - API request/response logging
- [utils/retryQueueManager.ts](utils/retryQueueManager.ts) - Failed scrape queue
- [utils/domainScraperSettings.ts](utils/domainScraperSettings.ts) - Domain settings management

### Database
- [database/database.ts](database/database.ts) - Sequelize setup
- [database/sqlite-dialect.js](database/sqlite-dialect.js) - Custom dialect
- [database/models/](database/models/) - Domain and Keyword models
- [database/migrations/](database/migrations/) - Schema migrations

### Background Worker
- [cron.js](cron.js) - Main cron worker (schedules scraping, notifications, retries)

---

## Quick Start Checklist

When working on this project:

- [ ] Review [AGENTS.md](AGENTS.md) for contribution guidelines
- [ ] Use Node.js 20.18.1 (check `.nvmrc`)
- [ ] Run `npm ci` to install dependencies
- [ ] Run migrations with `npm run db:migrate`
- [ ] Start dev server with `npm run start:all` (web + cron)
- [ ] Write tests for all changes (see testing patterns above)
- [ ] Use test helpers from `__tests__/__helpers__/`
- [ ] Run linters before committing: `npm run lint && npm run lint:css`
- [ ] Ensure all tests pass: `npm test`

### Common Tasks

**Add new scraper:**
1. Create service file in [scrapers/services/](scrapers/services/)
2. Follow `ScraperSettings` interface
3. Register in [scrapers/index.ts](scrapers/index.ts)
4. Add tests for scraper extraction logic

**Add API endpoint:**
1. Create handler in [pages/api/](pages/api/)
2. Wrap with `withApiLogging`
3. Add `verifyUser` for protected routes
4. Write comprehensive tests (401, 405, 400, 404, 200)

**Database migration:**
1. Create timestamped file in [database/migrations/](database/migrations/)
2. Check table existence before altering
3. Wrap in transaction
4. Implement reversible `down` function

**Fix failing test:**
1. Check if mocks are properly configured at file top
2. Verify environment variables are saved/restored
3. Ensure `jest.clearAllMocks()` in beforeEach
4. Check boolean conversion for DB fields
