# Staged Rollout Plan

This document outlines the staged rollout plan for the upcoming changes. Each stage is designed to be incremental and verifiable, ensuring stability and performance improvements.

---

## Stage 0 — Preparatory (always do before/throughout)

- **Run full test suite and linter (baseline)**
  - Ensure current tests/lint pass before large changes.
  
- **Consolidate test helpers (`__tests__/__helpers__`)**
  - Move repeated fixtures/builders into shared test utilities.

---

## Stage 1 — Types & Constants (foundation)

- **Replace `as any` casts (`utils/*`, `scrapers/services/*`, `pages/api/*`)**
  - Introduce explicit interfaces for scraper responses, settings, and domain stats.
  
- **Centralize constants (`utils/*`, `scrapers/*`)**
  - Extract device names, scraper types, timeouts, and magic strings into a constants module.
  
- **Unify boolean normalization (`services/keywords.tsx`, `utils/parseKeywords.ts`)**
  - Create a shared boolean parsing utility and replace duplicates.
  
- **Gradually increase TypeScript strictness (`tsconfig.json`)**
  - Enable stricter checks in phases; fix resulting type errors incrementally.

---

## Stage 2 — Database (schema & indexes)

- **Add or validate indexes (`database/models/*`, `database/migrations/*`)**
  - Index frequently queried columns: `domain`, `keyword`, `device`, `country`.
  
- **Run migrations and DB-focused tests.**

---

## Stage 3 — API & Data Transfer

- **Reduce payload sizes (`pages/api/*`, `services/*`)**
  - Use DTOs/projections to return only necessary fields on list endpoints.
  
- **Update affected clients/components to consume smaller DTOs.**

---

## Stage 4 — Runtime & Scrapers

- **Dynamic imports for scraper services (`scrapers/services/*`)**
  - Load only the active scraper to reduce bundled dependencies and startup cost.
  
- **Reduce verbose logging in hot paths (`utils/refresh.ts`, `utils/scraper.ts`)**
  - Gate debug logs by `LOG_LEVEL` or add sampling for high-volume loops.

---

## Stage 5 — Frontend Performance & UX

- **Lazy-load heavy charting (`components/common/Chart.tsx`, `components/common/ChartSlim.tsx`)**
  - Dynamically import chart components and avoid repeated Chart.js registration.
  
- **Extract shared UI logic (`components/*`, `services/*`)**
  - Move repeated filter/format logic into reusable hooks/utilities.
  
- **Consolidate complex component state (`components/keywords/KeywordsTable.tsx`)**
  - Replace multiple useState hooks with useReducer or a dedicated hook.
  
- **Split settings UI by feature (`components/settings/*`)**
  - Lazy-load infrequently used settings panels to shrink initial dashboard payload.

---

## Stage 6 — Logging, Observability & Error Handling

- **Route all logs through the logger (`utils/logger.ts`)**
  - Replace console.log with structured logger calls.
  
- **Centralize API error handling (`utils/errorSerialization.ts`)**
  - Standardize error shapes for UI and cron consumers.

---

## Stage 7 — Maintenance & Cleanup (final PRs)

- **Audit unused dependencies (`package.json`)**
  - Remove unused packages and consolidate overlapping utilities.

---

## Stage 8 — Final verification (release gating)

- **Final verification: run `npm run lint`, `npm test`, and `npm run build`**
  - Ensure all tests pass, linting is clean, and production build succeeds.

---





TODO:



- **Reduce in-memory keyword processing** (`pages/api/keywords.ts`, `utils/refresh.ts`)
  - Consider pushing filtering/sorting/pagination to the database instead of loading full lists into memory.
  - Add cursor-based pagination for large datasets and avoid `.map()` chains on unbounded arrays.

- **Batch and parallelize keyword refreshes** (`utils/refresh.ts`)
  - Replace sequential per-keyword refresh loops with chunked `Promise.all()` batches.
  - Cache per-domain settings inside the loop to avoid repeated lookups per keyword.

- **Consider normalizing JSON-heavy columns** (`database/models/keyword.ts`)
  - Fields like history, tags, or last results could be normalized or stored with predictable schemas to reduce parsing overhead.

- **Evaluate connection pool settings** (`database/database.ts`)
  - Adjust pool size/idle timeout for higher concurrency if API usage grows.

- **Batch API operations** (`pages/api/keywords.ts`, `pages/api/domains.ts`)
  - Introduce bulk endpoints or request batching to reduce round-trips for large keyword sets.
