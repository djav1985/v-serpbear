# v-serpbear Optimization & Simplification Opportunities

This document captures **potential** areas to simplify and optimize the codebase. Items are grouped by theme and include pointers to the most relevant files/directories for follow-up work.

## Performance & Runtime Efficiency

- **Reduce in-memory keyword processing** (`pages/api/keywords.ts`, `utils/refresh.ts`)
  - Consider pushing filtering/sorting/pagination to the database instead of loading full lists into memory.
  - Add cursor-based pagination for large datasets and avoid `.map()` chains on unbounded arrays.

- **Batch and parallelize keyword refreshes** (`utils/refresh.ts`)
  - Replace sequential per-keyword refresh loops with chunked `Promise.all()` batches.
  - Cache per-domain settings inside the loop to avoid repeated lookups per keyword.

- **Cache scraper responses** (`utils/scraper.ts`, `scrapers/services/*`)
  - Add a short-lived TTL cache keyed by keyword + location + device to reduce duplicate external calls in the same run.

- **Lazy-load heavy charting** (`components/common/Chart.tsx`, `components/common/ChartSlim.tsx`)
  - Dynamically import chart components to reduce initial bundle size and avoid Chart.js registration per render.

## Database & Query Optimizations

- **Add or validate indexes** (`database/models/*`, `database/migrations/*`)
  - Index frequently queried columns such as `domain`, `keyword`, `device`, and `country` to speed up filters.

- **Consider normalizing JSON-heavy columns** (`database/models/keyword.ts`)
  - Fields like history, tags, or last results could be normalized or stored with predictable schemas to reduce parsing overhead.

- **Evaluate connection pool settings** (`database/database.ts`)
  - Adjust pool size/idle timeout for higher concurrency if API usage grows.

## API & Request Handling

- **Batch API operations** (`pages/api/keywords.ts`, `pages/api/domains.ts`)
  - Introduce bulk endpoints or request batching to reduce round-trips for large keyword sets.

- **Reduce payload sizes** (`pages/api/*`, `services/*`)
  - Return only necessary fields on list endpoints (use DTOs or projection) to avoid large JSON payloads.

- **Centralize API error handling** (`utils/apiError.ts`, `utils/errorSerialization.ts`)
  - Standardize error shapes so UI and cron can share handling logic consistently.

## Frontend Simplification

- **Consolidate complex component state** (`components/keywords/KeywordsTable.tsx`)
  - Replace multiple `useState` hooks with a `useReducer` or dedicated hook for filters/sorting.

- **Extract shared UI logic** (`components/*`, `services/*`)
  - Move repeated filter/format logic into reusable hooks or utilities (e.g., keyword filtering, device labels).

- **Split settings UI by feature** (`components/settings/*`)
  - Lazy-load infrequently used settings panels to reduce initial dashboard render cost.

## Type Safety & Code Quality

- **Replace `as any` casts** (`utils/*`, `scrapers/services/*`, `pages/api/*`)
  - Define explicit interfaces for scraper responses, settings, and domain stats.

- **Centralize constants** (`utils/*`, `scrapers/*`)
  - Move magic strings (device names, scraper types) and numeric timeouts into a constants module.

- **Unify boolean normalization** (`services/keywords.tsx`, `utils/parseKeywords.ts`)
  - Extract shared boolean parsing to a single utility to reduce duplicated logic.

## Observability & Logging

- **Route all logs through the logger** (`utils/logger.ts`)
  - Replace `console.log` in production code with structured logger calls.

- **Reduce verbose logging in hot paths** (`utils/refresh.ts`, `utils/scraper.ts`)
  - Gate debug logs by `LOG_LEVEL` or add sampling for high-volume loops.

## Build & Bundle Optimization

- **Dynamic imports for scraper services** (`scrapers/services/*`)
  - Load only the active scraper to reduce bundled dependencies.

- **Audit unused dependencies** (`package.json`)
  - Remove unused packages and consolidate overlapping utilities.

## Testing & Maintenance

- **Consolidate test helpers** (`__tests__/__helpers__` or similar)
  - Move repeated fixtures/builders into shared test utilities for easier maintenance.

- **Gradually increase TS strictness** (`tsconfig.json`)
  - Enable stricter checks in phases to reduce runtime errors and eliminate unsafe casts.

## Quick Wins (Low-Risk First Steps)

1. Extract constants for scraper types/device names/timeouts.
2. Consolidate boolean normalization utility across services.
3. Lazy-load chart components to reduce initial bundle.
4. Add pagination defaults to keyword list APIs.
5. Replace the most common `as any` casts with typed interfaces.
