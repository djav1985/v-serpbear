# AGENTS.md

## Purpose
This document defines baseline expectations for all contributors to maintain code quality, test coverage, and project stability.

---

## Development Guidelines

### Big picture
- Next.js 15 app with UI + REST API in [pages/](pages/).
- SQLite via Sequelize with custom better-sqlite3 dialect in [database/](database/).
- Background worker in [cron.js](cron.js) drives scraping, retries, Search Console refresh, and email digests.
- Scraper integrations live in [scrapers/](scrapers/) with per-domain overrides.
- Settings are encrypted in data/settings.json using `Cryptr(SECRET)` and accessed via settings API.

### Key flows & integration points
- Keyword tracking: Domain → Keywords → Scheduled scrapes → History → Email digests (see [utils/refresh.ts](utils/refresh.ts), [cron.js](cron.js)).
- Auth: JWT + `verifyUser` middleware for API routes (see [utils/verifyUser.ts](utils/verifyUser.ts)).
- API logging: wrap handlers with `withApiLogging` (see [utils/apiLogging.ts](utils/apiLogging.ts)).
- Search Console: credentials from settings or env (`SEARCH_CONSOLE_*`), refresh orchestrated in cron.
- Email: templates in [email/](email/) and send logic in [utils/generateEmail.ts](utils/generateEmail.ts).

### Conventions & patterns
- API routes use the pages router and often follow `withApiLogging` + `verifyUser` + model access.
- Domain scraper settings are masked/decrypted; use helpers in [utils/domainScraperSettings.ts](utils/domainScraperSettings.ts).
- Use shared test helpers from [__tests__/__helpers__/](__tests__/__helpers__/) instead of re-rolling mocks.
- Icons are registered in [components/common/Icon.tsx](components/common/Icon.tsx).
- Respect the no-trailing-commas rule in configs (linted).

### Developer workflows (project-specific)
- Node.js 20.18.1 per `.nvmrc` (README notes Node 18 is unsupported).
- Install: `npm ci` (preferred) or `npm install`.
- Migrations: `npm run db:migrate` (Docker runs them in [entrypoint.sh](entrypoint.sh)).
- Dev: `npm run dev`; full stack: `npm run start:all` (runs web + cron).
- Tests: `npm test` (Jest + happy-dom). Lint: `npm run lint` and `npm run lint:css`.

### Where to look first
- API routes: [pages/api/](pages/api/)
- DB models/migrations: [database/models/](database/models/), [database/migrations/](database/migrations/)
- Scraper providers: [scrapers/services/](scrapers/services/)
- Email templates: [email/](email/)
- Core utilities: [utils/](utils/)

### When changing behavior
- Update or add tests in [__tests__/](__tests__/) (see [AGENTS.md](AGENTS.md)).
- Keep API error handling consistent with existing handlers and `withApiLogging`.

---

## Final Touches Guidelines

- [ ] Tests updated or created for all features, fixes, or refactors  
- [ ] Tests placed in the correct test directory or existing test suite  
- [ ] Tests cover core logic and edge cases  
- [ ] Full test suite passes locally  
- [ ] Linting and formatting tools run locally  
- [ ] All linting and formatting issues fixed  
- [ ] Changes committed in small, reviewable chunks  
- [ ] Commit messages are clear and descriptive  
- [ ] No untested or lint-failing code committed  
- [ ] Changelog updated (if applicable)  
- [ ] Pull request passes all automated checks (tests, lint, build)  
- [ ] Pull request includes a concise summary of what changed and why  
- [ ] Related issues or tickets referenced (if applicable)

---

## Notes
These are baseline expectations—projects may have additional requirements documented elsewhere. Always follow the most restrictive applicable rules.
