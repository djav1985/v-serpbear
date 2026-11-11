# Changelog

All notable changes to this project will be documented in this file. Releases now follow the conventional commits format but are managed with lightweight project scripts instead of `standard-version`.

## [Unreleased]

### Added

- Add MCP OAuth authorization for ChatGPT with PKCE, dynamic client registration, 24-hour access tokens, token rotation and a themed approval screen using the normal SerpBear login. OAuth state is stored in `data/mcp_oauth.json`; direct MCP bearer access can use the separate `MCP_API_KEY`.

### Changed

- Require JSON bodies for keyword and domain PUT/DELETE arguments; remove the legacy `id` and `domain` query forms and update the frontend API calls.
- Move POST refresh and email arguments into JSON request bodies; update the frontend and cron worker callers. The scheduled refresh uses `{ scope: "enabled-domains" }` on `POST /api/serp/refresh`; remove `POST /api/app/cron`.
- Remove the unused `GET /api/auth/check` endpoint; the app checks sessions in protected layouts and API routes.
- Document `MCP_API_KEY` and MCP OAuth setup separately from the REST `APIKEY`.

### Fixed

- Serve protected-resource metadata at the domain-root well-known URL as a compatibility fallback while retaining the resource-path-specific URL.
- Point MCP authentication challenges to root protected-resource metadata for ChatGPT client compatibility while keeping OAuth endpoints under `/api/oauth`.
- Add CORS headers and preflight handling to OAuth discovery, registration, authorization, and token endpoints.
- Match the `google-seo-mcp` OAuth metadata fields, response bodies, protocol headers, code/token prefixes, and authorization-page behavior while retaining SerpBear login and JSON-file persistence.
- Advertise `mcp:full` and `mcp:read` in OAuth metadata and dynamic registration, and return the granted scope from token exchanges.
- Match MCP OAuth interoperability with `mcp:full` and `mcp:read` scopes, reference-compatible redirect and registration validation, root metadata challenges, CORS behavior, and `/api/oauth/revoke` grant revocation.
- Ignore unknown requested OAuth scopes when choosing between the supported full and read scopes.
- Log OAuth endpoint failures and MCP OAuth authentication failures at error level with diagnostic codes while keeping bearer tokens and authorization codes out of logs.
- Log successful OAuth discovery, registration, approval and token exchanges at info level without logging credentials.
- Add OAuth decision reason logs for registration, authorization, consent and token exchange, plus successful MCP authentication and request handling, without logging secrets.
- Omit `client_name` from OAuth dynamic-registration responses when the client did not provide a name, rather than returning an invalid `null` value.
- Avoid blocking request handling while cancelling an oversized debug logging stream.
- Load the settings editor through an explicitly authenticated full-settings request, and show an error instead of empty fields if the session is invalid.

### Changed

- Extend Important frontend coverage for domain settings validation, tracker and ideas cells, add/delete keyword mutations, and settings mutations.

- Extend critical Jest coverage for SQLite fallback/errors, refresh and scraper edge cases, SERP persistence errors, cron API failures, and Google Ads/Search Console response handling.

- Strengthen SQLite binding assertions by matching each recorded callback invocation's SQL, method, and arguments together.
- Reset stateful JWT, domain/refresh queue, and Search Console mocks between randomized cases to prevent order dependent results.

- Split SERP API route tests by method, merge keyword integrity cases by operation, and remove duplicate sticky validation coverage.

- Move settings-file and retry-queue tests into utility suites, merge domain-stats ordering coverage, and restore the refresh tests' SECRET environment value after each test.
- Split scraper strategy, Google link, and map-pack tests into focused suites; remove duplicate SerpBase city-location coverage.

- Split the mixed frontend Jest suites by add flow, tables, page loading, dialogs, viewport hook, and screenshot cache behavior; reset the add-flow API mock after each test.

- Split email route, dispatch, throttling, and HTML generation tests into focused suites; remove duplicate fallback coverage and isolate rate-limit state.
- Stub the browser anchor click in the CSV export test and assert the download is initiated without triggering Happy DOM navigation.
- Assert the decrypted secret values in authenticated settings tests and verify strict cron settings reads reject malformed JSON with a `SyntaxError`.
- Replace ineffective async `resolves.not.toThrow()` migration assertions with direct awaits so rejected migrations fail clearly.
- Cover client-origin selection in browser-free tests, including public/server URL precedence, trailing-slash normalization, and the localhost fallback.
- Remove a duplicate branding URL test and make the tracking-seed ordering test assert its resolved result instead of swallowing arbitrary errors.
- Remove duplicate keyword-coercion integration coverage and cover parsing structured keyword update errors; use explicit Jest rejection and value assertions.
- Add shared React Query, serialized keyword-row, and temporary app-data test helpers; reuse the existing response and request helpers across suites.
- Consolidate add-flow query hook tests and use accessible asynchronous queries for dialog fields.
- Dashboard pages use private browser caching for 60 seconds with revalidation after expiration; login pages are not stored, API responses use `no-cache, no-store`, and domain screenshots ask thum.io to cache for seven days.
- Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY` response headers.
- Add a Content Security Policy for local app resources, inline scripts/styles, Google favicons, and thum.io screenshots.
- Organize related Jest suites into API, database, email, refresh, scraper and utility folders without changing test coverage.
- Reorganize root-level Jest tests by domain across API, utility, SERP and frontend suites while preserving their existing cases.
- Split Google API, SERP API, and client utility tests into focused subdomain suites.
- Split chart data, CSV export, and serialization/display tests into focused client utility suites; remove a wall-clock threshold from the large Search Console aggregation case.
- Split scraper provider request and response contracts, and move remaining utility helpers into focused existing and new suites.
- Refine API test isolation and request setup; remove duplicate auth-check fallback cases while retaining distinct token scenarios.
- Clarify SQLite boolean-binding test names to state the adapter contract they verify.
- Move keyword integrity API tests into the SERP API test folder.
- Remove duplicate country and search predicate cases from client utility tests.
- Clean up Jest isolation and setup: replace sleep-based queue and lock tests with deferred promises, restore screenshot spies after every test, and combine the duplicate invalid-domain route checks.
- Consolidate repeated scraper URL checks and equivalent malformed-input cases; cover accepted same-origin refresh requests.
- Remove unused API assertion and mock helpers, and document the active Jest helpers with their intended usage.
- Isolate logger environment changes and restore fetch, console, and logger spies reliably between Jest tests.
- Extend existing refresh, API and scraper-provider suites with cache/fallback, malformed-input, cleanup, concurrency, and provider-response cases to improve branch coverage without adding suites.
- Remove 21 low-value tests that repeated wrapper behavior, equivalent malformed-input cases, or copy-only output checks.
- Domain cards render from the dashboard's domain list, then load card stats in batches as they approach the viewport; favicons and screenshots use the same viewport signal. Charts and Tracker keywords load on demand. Discover, Ideas, and Research fetch tracked keywords and scraper city support only when the add dialog opens, then check duplicates using the selected location and device. Main-menu navigation links do not prefetch routes.
- Domain subpages load only the selected domain alongside app settings. Hovering or focusing a domain name warms its Tracker page, and hovering or focusing any domain tab warms that page. Mobile stacked tables clip the desktop grid during the first paint until hydration switches to the mobile layout.
- Mobile keyword search fields stay in the top-right toolbar slot; country and group filters occupy separate grid slots below, avoiding overlap at narrow widths. This covers Tracker, Discover, Ideas, Research, and the Keywords section in Insight.
- The Tracker Search Console period selector shares a row with sorting and column controls on mobile.
- Discover’s mobile device tabs collapse to icons with counts so their labels cannot intrude into the keyword search field.
- Discover keyword details mirror the Ideas side panel, with a 30/7/3-day comparison chart for average daily clicks, average daily impressions, and average position, plus the Google Search results action. The chart placeholder reserves space for the plot, legend, and caption to prevent a layout shift when it loads.
- Ideas detail charts mount with the side panel, matching the other keyword panels and avoiding a second delayed update during its opening animation.
- Table rows, empty states, and charts in keyword detail panels fade in over one second when loaded, replacing visible loading skeletons with transparent space. Insight and keyword detail charts keep their space without visible loading blocks.
- Insight tables use the same viewport-based desktop height as Tracker and Ideas tables.
- Domain cards reserve space for update-time, credit values, and stats while loading, then fade in the fetched values over one second. Stat value rows keep a fixed height and do not wrap, preventing card layout shifts when values arrive on desktop and mobile. The screenshot transition and Domains page total keyword count also fade in over one second when ready.
- Domain card Search Console stats align vertically with Tracker stats on desktop.

## [6.0.0] (2026-11-08)

### Added

- Credited the dashboard UI source and linked its MIT license in the README.
- SerpBase (`serpbase`) scraper: Google search through `POST https://api.serpbase.dev/google/search` with the key in the `X-API-Key` header. City-level targeting through the `location` parameter, mobile and desktop, map pack from `local_results`, and organic results ranked by `rank`. When a result link is a `google.com/goto` redirect, the result's own domain is used instead. SerpBase also reports credits remaining through its free `/account/credits` endpoint.
- Domain cards show `Credits remaining:` under the last-updated line for scrapers that report it: SerpApi, SearchApi, ValueSERP, HasData, CrazySERP, PrismCrawl, SerpBase and DataForSEO (a dollar balance). Serper and Serply have no way to look it up, so nothing shows. SerpApi, SearchApi, ValueSERP, HasData, CrazySERP, SerpBase and DataForSEO are asked once per API key at the end of a refresh run. PrismCrawl sends the balance in the `X-Credits-Remaining` header, so the lowest value seen in the run is kept. Balances are saved in `data/scraper_credits.json`, keyed by scraper and a keyed hash of the API key, so domains sharing a key share one entry. Entries no domain or the global setting uses anymore are dropped on each save.
- Domain cards hold the favicon for 500 ms, so a cached screenshot replaces it without a flash, then the screenshot fades in over 500 ms. Settings and domain settings tabs fade their panels in over 1 s, and the domain settings dialog keeps a fixed height and footer position.
- Page changes cross-fade (400 ms), and the top bar stays still. Tracker and Discover filters, sorting and the Search Console period update inside transitions. Dialogs and sheets use a 400 ms fade. All motion is turned off for users who prefer reduced motion.

### Security

- A failed login or API key from a client with no known address (`TRUST_PROXY` unset) no longer locks out the real user through a shared "unknown" bucket. Per-user caps still apply, and a correct password or API key is accepted while they are reached.
- The one-off keyword search moved from `GET /api/serp/refresh` to `POST /api/serp/refresh` (body `keyword`, `country`, `device`). Only a logged-in session can run a search (an API key cannot), and requests from a login session must come from this site, so a link on another site can no longer start a refresh or spend provider quota. `GET` now only serves `?status=retry`.
- Login bodies are capped at 4 KB and other JSON bodies at 1 MB, answering 413 when larger. Debug request logging reads at most 16 KB of a body and never buffers larger ones.

### Changed

- Node.js is now 26.13.0 (the current long-term release) in the Docker image and `.nvmrc`, and `package.json` declares `engines.node >=22`.
- Mobile tables now scroll with the page while keeping rows virtualized, instead of using a separate table scroll area.
- Logo endpoints cache custom and bundled images for one year; favicon responses and domain screenshot thumbnails cache for one week.

### Fixed

- Guarded keyword history and search volume writes after location changes, isolated scraper credit tracking by refresh, and made refresh startup and keyword creation safe when requests overlap.
- Scraper credit balances are saved in the order they were read. Overlapping refreshes (up to three domains run at once) could finish in a different order than they started, so a slow account lookup or an older header reading could overwrite a newer balance. Each reading now carries the time it was taken (when a lookup started, or when the response arrived) and the save, under the existing file lock, only replaces an entry that was read earlier. A newer balance can still be higher, for example after a top-up. Entries saved before this change count as oldest.
- Domain stats are saved one update at a time per domain. Adding keywords while a refresh finishes on the same domain could make both updates read the same "previous" numbers and overwrite each other's up and down arrows. Each update now reads the current data after it gets its turn. Different domains still update in parallel.
- Changing a keyword's location no longer races a refresh. The edit claims the domain first, like a delete does, and answers `409` with a message telling you to try again once the refresh has finished when one is running or queued. Only keywords whose location or country really changed are touched: in one transaction they lose their old position, history, ranked URL, saved results, map pack data and refresh status, then a fresh scrape runs with the new location. If that scrape fails the keyword stays empty instead of showing another city's rankings.
- Queued refreshes now wait while a delete or location edit holds their domain, and start when it is released. A request that queues its own refresh hands its claim to that task, so nothing can slip in between. Refresh tasks (manual, cron-style, after adding keywords, after a location change) load their keywords by ID when they start, so a keyword deleted while the task waited is skipped and a moved one is scraped with its current location.
- The toast for a blocked keyword delete, location change or domain delete now shows the server's message ("try again once the refresh has finished"). Other errors keep the generic text.
- The screens no longer set state inside effects (the `use-mobile` hook, add-keywords dialog, research form, and the selection and tag-filter clean-ups), so `eslint-plugin-react-hooks` 7 passes with no errors.
- Pinned the patched `minimatch`, `glob` and `uuid` versions for the packages that bundled old copies, so `npm audit` is down from 34 findings to 7 low ones (the remaining `deepmerge` finding has no fix). The `editorconfig` override no longer gets reset by `npm install`.

### Dependencies

- Updated to the latest releases that work together: Jest 30, TypeScript 6, `better-sqlite3` 13, `croner` 11, `dotenv` 18, `google-auth-library` 11, `@googleapis/searchconsole` 11, `@isaacs/ttlcache` 2, `undici`, `uuid`, Testing Library and the type packages, plus all in-range updates (Next.js, nodemailer, dayjs, PostCSS and others).
- Held back: ESLint 10 and its plugins, TypeScript 7 (typescript-eslint does not support it yet) and Stylelint 18 (its packages do not resolve together yet).
- `tsconfig.json` uses `paths` instead of the removed `baseUrl`, and the Stylelint config allows Tailwind's `@apply`.

### Removed

- Unused dev dependencies (`msw`, `@types/cryptr`, `autoprefixer`, `js-yaml`, `postcss-selector-parser`, `source-map-js`, `browserslist`, `esbuild`, `shell-quote`, `ws`, `@babel/core`), the msw test shims, unused UI pieces (`badge`, `empty`, `separator`), the unused `screenshot.jpg`, and two unused constants.

### Fixed

- Settings toasts now show the server's own error text (for example the reason a Google Ads test failed) instead of a generic line, and failed form checks on Update Settings also show a toast.
- Send Notifications Now reports how many emails went out, and shows a warning instead of a success when nothing was sent.

### Documentation

- The provider tables in the README and the Scrapers wiki page have a "Credits left" column showing which scrapers report the balance. The Scrapers page has a longer "Credits remaining" section: how each provider is asked, when the number updates, shared keys, the saved file and troubleshooting.
- Added desktop screenshots to the wiki pages (in `docs/images/`), and a set of desktop and phone screenshots in `screenshots/`, all taken from demo data with example domains.
- The Google guide links in the app now point to the wiki's Google Integrations page.

### Upgrade notes (API routes)
The API routes are regrouped. **There are no compatibility aliases: the old routes now return 404.** Update scripts, cron jobs, MCP clients and reverse-proxy rules that call them.

| Old | New |
| --- | --- |
| `/api/settings` | `/api/app/settings` |
| `/api/cron` | `/api/app/cron` |
| `/api/notify` | `POST /api/app/email` with JSON body `{ type: "digest" }` |
| `/api/ideas/email` | `POST /api/app/email` with JSON body `{ type: "ideas", ... }` |
| `/api/login`, `/api/logout`, `/api/auth-check` | `/api/auth/login`, `/api/auth/logout`, `/api/auth/check` |
| `/api/domains`, `/api/domain`, `/api/keywords`, `/api/keyword`, `/api/refresh`, `/api/clearfailed` | the same names under `/api/serp/` |
| `/api/searchconsole`, `/api/insight`, `/api/ideas`, `/api/volume` | the same names under `/api/google/` |
| `/api/branding/logo` | `/api/images/logo.png` |
| `/api/branding/config` | removed (the name and logo are in `GET /api/app/settings` as `branding`) |

`/api/adwords` and `/api/mcp` are unchanged. The Docker health check now calls `GET /api/app/settings`.

### Added
- `GET /api/app/settings` returns a read-only `branding` object (`platformName`, `whiteLabelEnabled`, `hasCustomLogo`, `logoApiPath`, `defaultPlatformName`) in both the public and the signed-in response. A settings save never writes it.
- `POST /api/app/email` sends both kinds of email, chosen by the JSON body `type`: `digest` accepts the API key or a login session, `ideas` needs a login session and answers `403` to an API key. A missing or unknown `type` is a `400`.
- The web app manifest is generated at `/manifest.webmanifest`, so white-label installs use your name and logo. The apple touch icon follows the logo too.

### Removed
- The `setup:git` script (`scripts/set-default-branch.mjs`) and the unused test fixture `__mocks__/data.ts`.

### Changed (API)
- **The API runs on the App Router.** Every endpoint is now a route handler in `app/api/**/route.ts` that takes a standard `Request` and returns a standard `Response`; `pages/` is gone. URLs, methods, request bodies and response shapes are the same. A shared wrapper (`createRoute` in `utils/apiLogging`) adds the request id, logging, the database check, the login or API-key check and the `405` answer. A method a route does not offer answers `405` with an `Allow` header. The MCP route uses the SDK's web-standard transport, and the `cookies` package is no longer a dependency.
- **`TRUST_PROXY` matters more.** A route handler cannot see the connection's address, and Next keeps a client-supplied `X-Forwarded-For` as it is, so the header is read only when `TRUST_PROXY` names the proxies in front of the app. Without it every client counts as one address: five wrong logins or API keys from anyone lock everyone out for 15 minutes. Set `TRUST_PROXY` when the app sits behind a reverse proxy.
- The log line for a request shows the path and query, as before. Unauthenticated calls to a route that does not exist for that method now answer `401` before `405`.
- `/api/images/favicon.png` serves `data/favicon.png` the same way (white-label on and the file exists, otherwise the built-in default), and the tab icon uses it when white-label is on. `/api/images/logo.png` stays the logo. Only these two file names exist.
- `/api/images/logo.png` always returns an image: your `data/logo.png` when white-label is on and the file exists, otherwise the built-in default. It used to answer 404 in those cases. Only that one URL exists, so other file names return 404.
- Server pages and utilities read the settings through `utils/appSettings` instead of importing from an API route.

### Changed
- **New front end:** the whole interface is rebuilt on the Next.js App Router (React 19, Tailwind CSS 4, shadcn/ui, TanStack Query, Table and Virtual, and Recharts). The URLs are the same: `/login`, `/domains`, `/domain/<slug>`, `/domain/console/<slug>` (Discover), `/domain/insight/<slug>`, `/domain/ideas/<slug>` and `/research`. `/` now redirects to `/domains`. The JSON API now lives in `app/api/` (see Changed (API)); its URLs, methods and bodies are the same.
- **Layout:** a top bar with the logo on the left and the menu on the right replaces the sidebar. The domain list sits on the left only on the Domains page. Settings open in a side panel with the Scraper, Notification and Integrations tabs. Phones get a menu button, stacked rows and a compact filter bar.
- **Tables:** Tracking, Discover, Insight and the keyword ideas tables share one virtualized table, so long keyword lists scroll smoothly. Row selection works on keyword IDs and ignores rows hidden by a filter. The column header stays solid while you scroll, and the table is sized to whole rows.
- **Tracking tab:** a single `Add/Edit Tags` action replaces the separate add and remove tag buttons.
- **Help:** the Help button in the menu opens this project's wiki on GitHub instead of the upstream docs site.
- **Look:** the accent colour is now green (`#33cc66`, with dark text on green buttons) in place of indigo. Cards and tables get a soft shadow, the top bar is solid white with a shadow, table headers and the domain-card stat boxes carry a light green tint, and the web app's theme colour matches.
- **Page background:** a faint tiled texture (`public/body-texture.png`) sits behind every page. The top bar, cards and tables stay solid.
- **Domain list:** each domain shows its site icon (a larger 32px copy for sharper rendering), and a globe takes its place when the icon cannot be loaded, so the names always line up.
- **Buttons:** the label text is nudged down by half a pixel so it sits in the vertical centre of the button. It was drawn slightly high, because of how the font's line box is spaced. Icons stay where they were.
- **Selection bar** (Discover, Ideas and Research): on phones the Desktop and Mobile buttons stretch to fill the bar, and on Research so does the domain picker, each running the full width. Desktop is unchanged.
- **Research** now lives inside the same page frame as every other screen.
- **Charts:** Chart.js is replaced by Recharts. The Insight chart plots visits and impressions on two axes.
- **Domain thumbnails:** always loaded from the screenshot service and cached in the browser, with the site's favicon as the fallback.
- The Map Pack figure on a domain card now also shows when any domain has map pack keywords, even if the active scraper does not report them.
- **White-label logo file:** the logo is now always `data/logo.png` and `/api/branding/logo` serves only that file, as a PNG. The `WHITE_LABEL_LOGO_FILE` setting is removed and is ignored if still set. If you use white-label branding, rename your existing logo (by default `data/branding-logo.png`) to `data/logo.png`, and convert it to PNG if it was another format.

### Removed
- The `SCREENSHOTS` environment variable (and the earlier `NEXT_PUBLIC_SCREENSHOTS`). See the screenshots upgrade note under 5.0.0.
- The old Pages Router screens, their React components, hooks, client services and tests, along with `styles/` and `tailwind.config.js`.
- The `chart.js`, `react-chartjs-2`, `react-query` (v3), `react-hot-toast`, `react-timeago`, `react-transition-group`, `react-window` and `next-router-mock` packages.

## [5.0.0] (2026-11-06)

### Upgrade notes
1. **Timezone shift:** Dates now follow `TZ`. If the server previously ran in UTC, the day boundary shifts once on the changeover day. Old history keys are not re-keyed.
2. **Runtime data files:** On `main`, `data/settings.json`, `data/failed_queue.json`, `data/session.json` and `data/SC_*.json` are tracked by git. This branch untracks them (`.gitignore` ignores `data/*` except `.gitkeep`), so pulling or merging it can delete your local copies. Back up `data/` before pulling. The database is also backed up to `<db>.bak-<date>` before duplicate keywords are removed.
3. **Committed secrets:** Secrets that were committed in `data/settings.json` remain in git history. If this repository was ever shared or made public, rotate `SECRET`, `APIKEY`, login passwords, SMTP credentials, and Search Console and Google Ads keys.
4. **Cron settings:** `CRON_MAIN_SCHEDULE` and `CRON_EMAIL_SCHEDULE` are now times of day (`HH:MM`, 24 hour, defaults `00:00` and `06:00`) instead of cron expressions, and `CRON_FAILED_SCHEDULE` is now `hourly` (default), `daily` or `never`. An old cron expression is ignored with a warning and the default is used, so update your `.env` and compose file.
5. **Screenshots setting:** `NEXT_PUBLIC_SCREENSHOTS` and `SCREENSHOTS` are both removed. Domain thumbnails always use the screenshot service and fall back to the site's favicon. You can delete either variable from your `.env` and compose file.
6. **Timezone setting:** `CRON_TIMEZONE` is removed. The standard `TZ` variable now sets the timezone for the cron schedules, dates, history keys and the container clock (default `America/New_York`). If you set `CRON_TIMEZONE`, rename it to `TZ`.

### Added
- Added optional `SERPER_API_KEY` (passed through `docker-compose.yml`): organic results that are `google.com/goto` links for any scraper are resolved to real URLs with Serper's free `/resolve` endpoint, with a 30 second timeout per call. A failed or timed-out call is tried once more, and links that come back unresolved are sent once more after the `retryAfter` seconds Serper reports. Anything still unresolved is logged as a warning and keeps the Google link.
- PrismCrawl organic results that come back as Google redirect links (`google.com/goto?url=...`) now use the result's own `domain` as the URL, so the tracked domain can be matched. A link with no domain stays a `goto` link unless `SERPER_API_KEY` is set (see the entry above).
- CrazySERP now reports map pack results from its `locations` block (title and `website_url`) and matches the top 3 against the domain's business name.
- Added `usesResultOffset` for scrapers that page by result offset (`start`): each page now starts after the results already returned, so short pages no longer skip results (PrismCrawl, SerpApi, HasData, Serply).
- Read-only MCP server at `POST /api/mcp` (Streamable HTTP, stateless) with six tools: `get_keyword`, `list_keywords`, `list_domains`, `get_searchconsole`, `get_insight` and `get_keyword_ideas`. It uses the same `Authorization: Bearer <APIKEY>` header as the REST API.
- API-key brute-force limit: 5 wrong `Authorization` keys from one client address lock that address out of the API for 15 minutes (`429` with `Retry-After`). It reuses the login throttle in `utils/loginThrottle.ts`.
- Discover and Ideas share an add-to-tracker bar with a Desktop/Mobile toggle, tags and a location picker. The Tracking tab has a bulk `Change Location` action, which `PUT /api/keywords` accepts.
- The keyword tag filter has a `No Tags` option for keywords without tags. It is exclusive: picking it clears the other tags, and picking a tag clears it.
- Domain stats show up and down triangles against the previous refresh for keywords tracked, Search Console visits, impressions and position. Position triangles are hidden when either value is unranked (0).
- `PARALLEL_REFRESH_CONCURRENCY` (default `10`) caps how many keywords are scraped at once on the parallel refresh path.

### Changed
- Domain average position is a whole number and follows one rule set: a failed latest scrape is left out; a map pack keyword with a known spot counts at the better of its spot and its organic position (organic 0 is ignored); a keyword that ranked before and is now at 0 (and not in the map pack) counts at 10 x pages scraped instead of being dropped; keywords that never ranked are left out. The stats are recalculated after every refresh that saves results and whenever keywords are added or deleted (not when the scrape strategy, page count or business name changes, until the next refresh). A failed stats save is retried once. Emails recalculate from the keywords at send time.
- The keyword CSV export has a new `Map Pack` column right after `Keyword`: `0` when the keyword is not in the map pack top 3, otherwise its spot (1, 2 or 3). It is empty when the keyword is in the top 3 but its local results have no spot (rows saved before the local results were stored).
- **API behaviour:** `/api/notify` returns 404 for an unknown domain; upstream failures from Google or a scraper now return 502 and write failures 500 (were 400); `/api/cron` may include a `skipped` list; `POST /api/volume` (domain mode, `domain=all`) and `POST /api/ideas/email` are rate limited; a corrupt `settings.json` fails saves with 500.
- The Local Search Results panel now shows every business in a yellow box and only the tracked business (matched by business name in the top 3) in green. Local results saved before this change have no flag, so they show yellow until the keyword is refreshed.
- **Breaking for API callers:** every API endpoint now takes a real domain name (`example.com`) instead of a URL slug. `GET /api/searchconsole` and `GET /api/insight` no longer accept slugs. On `/api/ideas`, `domainSlug` and `domainUrl` are merged into one `domain` field (GET query, PUT body and POST body); leaving `domain` out means the research page. Data file names and page URLs are unchanged.
- README: the `API contract` section is now `External API` and lists the endpoints reachable with the API key.
- `POST /api/domains` now strips a leading `www.` from hostnames, matching the Add Domain form. A new migration renames existing `www.` domains (skipped when the bare domain already exists).
- Keywords and locations are sent to scrapers exactly as stored; the old `decodeURIComponent` step (which corrupted values such as `50%25 off`) is removed; the same migration decodes any percent-encoded values already stored.
- The unused global `search_console`, `white_label_enabled`, `white_label_logo_file`, `platform_name` and `notification_email` settings were removed; Search Console is controlled by credentials only, white-label is controlled only by the `NEXT_PUBLIC_WHITE_LABEL`, `NEXT_PUBLIC_PLATFORM_NAME` and `WHITE_LABEL_LOGO_FILE` environment variables, and notification recipients come only from each domain's `notification_emails`. Old `settings.json` files that still contain these keys are cleaned up: migration `1781000000000-drop-removed-settings-keys` deletes them, `GET /api/settings` never returns them, and a save drops them. A `PUT /api/settings` that sends them is accepted and the keys are ignored.
- The unused `tags` column on the `domain` table was dropped (keyword tags are unchanged). Migration `1790000000002-drop-domain-tags-column` drops it, skipped when the column is missing, with the database backed up first.
- Dead code cleanup (no behaviour change): removed `SAFE_DOMAIN_SLUG`, the `redactSecrets`/`redactUrl` re-export in `utils/apiLogging.ts`, the unused `originOverride` argument of `buildLogoUrl`, unused props on `KeywordsTable`, `Settings`, `ToggleField` (`classNames`, `disabled`) and `PageLoader` (`label`), unused fields on the `KeywordIdeasUpdater` props type and `ValueSerpResult`, and the unused `website` field on every scraper definition.
- Removed about 15 blocks of commented-out code, the unused `.chart_tooltip` and `.ff-sm`/`.ff-md`/`.ff-lg`/`.ff-xl`/`.ff-round` styles, `public/vercel.svg`, `public/fflags.png`, five unused Tailwind safelist entries, the `follow-redirects` override in `package.json`, `set -o pipefail` in `entrypoint.sh`, a stale `#image:` comment in `docker-compose.yml`, and unused patterns in `.gitignore` and `.dockerignore`.
- Fixed Insight: the countries average now divides by the rows counted (it divided by unique keywords), and keywords containing underscores or spaces are no longer rewritten or merged.
- Fixed the scrape delay setting: it now offers No Delay, 5, 10 and 30 seconds (the minute options were silently capped at 30 seconds). A saved value above 30 seconds still applies as 30 seconds.
- Fixed the hourly failed-scrape retry job: it now does nothing unless Auto Retry is on. The daily notification job skips the digest when no SMTP server is set instead of failing with a 400 each run.
- Fixed the add-keywords dialogs: the button shows "Adding..." and is disabled while the request runs, so a double click cannot submit twice.
- Serper has no device option. A mobile keyword whose matching desktop keyword (same domain, keyword, country and location) is in the same refresh now takes the desktop result without its own request. Any other mobile keyword is still scraped with desktop results and a warning is logged for each one.
- `docker-compose.yml` now passes `SCREENSHOTS` and `TRUST_PROXY` (default `0`), and its comment about `SECRET` and `APIKEY` is corrected (nothing checks them at startup). `zod` is now a declared dependency.
- Emails without `NEXT_PUBLIC_APP_URL` use the default logo instead of a broken relative URL. Business-name matching ignores accents. Search Console data is read in pages of 25,000 rows instead of stopping at 1000. The ideas "no results" message no longer mentions a volume minimum.
- Every writer of `settings.json` (including the Google Ads callback) now strips the removed keys.
- **Behaviour change:** `x-forwarded-proto`, `x-forwarded-protocol` and `x-forwarded-ssl` now only mark a request as HTTPS when `TRUST_PROXY` is set. Behind a TLS-terminating proxy, set `TRUST_PROXY=1` or the login cookie will not get the `Secure` flag.
- Adding keywords and the bulk `Change Location` action skip keywords that are already tracked (same keyword, country and device) and report them in the toast, for example "Added 2 keywords. Skipped 1 already tracked: alpha (desktop)."
- A location that names a country sets the keyword's country (for example `London,England,GB`), and a country name in a location is stored as its code, so `Austin,TX,United States` is saved as `Austin,TX,US`.
- The keyword CSV export has one `Location` column after `Country`, instead of separate `State` and `City` columns.
- The domain Active toggle moved to the Scraper tab of Domain Settings, and the Notification tab says that a blank address turns email off for that domain.
- Deleting a domain while it is being refreshed returns `409` instead of hanging.

- The scrape intervals (`daily`, `other_day`, `weekly`, `monthly`) all run at the `CRON_MAIN_SCHEDULE` time instead of a fixed midnight, and the digests run at the `CRON_EMAIL_SCHEDULE` time. Failed-scrape retries can run daily at the main time, or be turned off. Removed the hidden `hourly` scrape interval; a stored `hourly` value now runs daily.
- Serper is now targeted by country only: it no longer sends the stored city location, and the State and City fields are not offered for it. Existing keywords with a city are checked at country level. SerpApi sends its key only as the `api_key` query parameter, not also as an `X-API-Key` header, and Serply now sends `gl`.
- Fixed review findings: the Insight tab's keyword, page and country totals are now computed in one pass, so a 25,000-row Search Console window no longer blocks the server for seconds. "Remove stored key" on a domain scraper can now be saved without typing a new key.
### Fixed
- The Scraping Frequency, Keyword Scrape Delay and Notification Frequency settings no longer say they need a server or Docker restart: changes to the scrape and notification schedules are applied live by the cron worker, and the scrape delay is read on every refresh.
- A domain scraper override without its own key no longer sends the global scraper's API key to a different provider.
- Keywords whose domain override key cannot be decrypted now leave the retry queue instead of being retried every hour.
- `scrape_delay` is now one per-domain spacing between requests on both the parallel and sequential paths (it was ignored on the parallel path and applied per worker, about 3x too fast, on the sequential one).
- SerpApi sends `gl` in lowercase like the other providers. A `null` provider response now gives a clear error. Serper logs a warning that it has no mobile option. A corrupt stored `history` value is logged and no longer overwritten by the next refresh.
- The retry queue file is created inside its lock, so two first refreshes can no longer drop a keyword.
- Migration `1790000000001-strip-skipped-lastresult-entries` removes the legacy `skipped` placeholder entries from `keyword.lastResult`, so old rows no longer show blank result rows before the next refresh.
- `keyword.volume` is now an INTEGER on upgraded installs (new migration `1780000000000`), so volume ordering is numeric. The same migration sets the `country` default to `US`, matching the model.
- Indexes are created on fresh installs (the index migrations ran before the tables existed). A failing unique index at startup is logged instead of stopping the app. The `www.` domain migration no longer aborts on colliding rows, and the Smart-strategy migration writes `settings.json` atomically.
- Cron: the worker honours `APP_URL` for its own calls (also passed through `docker-compose.yml`), keeps its schedule when `settings.json` is unreadable, no longer writes `settings.json`, logs a clear message when `SECRET` is unset, and "every other day" now runs on odd days of the month, including the 31st.
- The PR auto-fix workflow no longer interpolates the branch name into a shell and skips fork PRs.
- Login: a correct password is no longer refused because strangers filled the user-wide failure cap. A non-Bearer `Authorization` header, or one sent with a valid session cookie, no longer counts as a wrong API key. `POST /api/cron` skips domains that are already being refreshed. A missing `session.json` now yields a fresh session version so logged-out tokens stay invalid. A corrupt `settings.json` fails a save with a 500 instead of blanking secrets.
- API hardening: null or malformed bodies return 400, ids must be whole numbers, tag keys must be canonical ids, internal error text is logged and not returned, unknown settings keys are ignored, and domains are trimmed and lowercased consistently. Lowercase country codes work for keyword ideas, ideas saves are locked against the favourites toggle, and Search Console "Last 7 Days" covers 7 days.
- UI: Discover country filter, location picker, tracked-keyword check by location, select-all pruning, sticky star, app-timezone tooltips, numpad Enter for tags, safe result links, domain settings and Ads callbacks no longer wipe unsaved input, research seeds are trimmed and capped at 20, a "Remove stored key" control for per-domain scraper keys, plus accessibility and dropdown fixes in several components.
- First login no longer bounces back to `/login`.
- A failed scrape page keeps the keyword's previous position, history and stored results instead of recording it as not ranked or wiping them.
- Scraper response bodies are read with a 30-second limit, so a stalled body no longer hangs a refresh.
- SearchApi no longer double-encodes `+` in `q` and `location`.
- The keyword table and the Add Keywords form now decide whether to show city and state from the domain's own scraper when it overrides the global one, so a domain on a city-capable provider keeps its city and state visible while the global scraper is country-only.
- The unranked penalty in the average position now follows the scraper's strategy rules: a domain set to "Use Global Setting" ignores a page limit left on the domain and uses the global one.
- Migration `1790000000001-strip-skipped-lastresult-entries` checks the `keyword` columns with `PRAGMA table_info` instead of Sequelize's `describeTable`, which throws on the `keyword_tracking_target_idx` expression index and would have stopped the upgrade at startup. The migration test now runs against a database that has that index.

### Security
- The MCP server at `/api/mcp` now accepts only `Authorization: Bearer <APIKEY>`. Cookies and login sessions are ignored there. Wrong keys still count towards the API-key lockout.
- Upgraded the Node.js runtime from 20.18.1 (end-of-life) to 24.22.1 in `.nvmrc`, the Docker base image (`node:24.22.1-alpine3.24`), and CI to fix an out-of-bounds write in the bundled Brotli decoder reachable through `fetch()` responses with `Content-Encoding: br`.
- Logout now revokes the session everywhere: tokens carry a session version in `data/session.json`, and `GET /api/settings` and `/api/auth-check` reject revoked tokens.
- Added `TRUST_PROXY` to read the real client IP from `X-Forwarded-For` behind a reverse proxy. The default is the socket address.
- Login is limited to 5 failures per username and 20 per client address within 15 minutes, with a 15-minute lock. Lockout, throttle and rate-limit tables are bounded.
- Passwords, secrets, OAuth `code`/`state` values and other sensitive query values are redacted from logs, and raw usernames are no longer logged.
- `/api/domain` masks saved Search Console credentials the same way `/api/domains` does.
- `docker-compose.yml` and `.env.example` no longer contain committed secrets; `SECRET` and `APIKEY` must be set in `.env` or the shell.
- CSV exports prefix keyword text that starts with `=`, `+`, `-` or `@` (after any leading spaces) with an apostrophe, so spreadsheets do not run it as a formula.
- Dependabot advisories are patched: `next` is 16.4.4 and `undici` is 7.30.1, and `qs`, `fast-uri`, `zod` and `minimatch` are moved to patched versions.

### Changed
- Removed the **Smart** scrape strategy and its Full Fallback option: it estimated pages from the last position, which drifts when the map pack takes organic slots. Existing Smart settings (per domain, and the global setting in `data/settings.json`) are migrated to **Basic** (page 1 only).
- A page 1 with local results but no organic results now records the map pack and reports position 0 instead of keeping the old map pack value.

### Features
- Added a Settings action to immediately retry all keywords in the failed retry queue.
- Added `PARALLEL_SCRAPE_CONCURRENCY` to control simultaneous keyword scrapes per domain for sequential scraper providers.
- Added PrismCrawl (`prismcrawl`) scraper integration with organic results and map pack matching from `serp_features` `local_results` (URL first, business name fallback).
- Added DataForSEO (`dataforseo`) scraper integration using the Google Organic Live Advanced endpoint, with map pack detection from `local_pack` results. The API key field takes `login:password` for HTTP Basic auth.
- Scraper settings can now declare a POST method and JSON request body (`method` / `body` on `ScraperSettings`); GET remains the default.
- Extractor input now includes the requested pagination, so providers that return a deeper result set can slice out the requested page.

### Changed
- All dates now follow `TZ` (default `America/New_York`): cron fire times, "today" in results, emails, throttling and the UI, and history keys, which are the calendar date in that zone. Instants are still stored in UTC. If the server previously ran in UTC, the day boundary shifts once on the changeover day, so one day may overlap or be skipped. Existing history keys are not re-keyed, and changing `TZ` later leaves old keys with their original dates.
- Search Console days always follow Google's Pacific Time; the fetch window is computed in Pacific days.
- Removed the deprecated SpaceSerp, ScrapingAnt, ScrapingRobot, and custom proxy scraper integrations along with the legacy raw Google HTML fallback path.
- Legacy global scraper selections for removed providers now normalize to `none`, and stale per-domain overrides for removed providers are cleared during migration.
- Updated README, Copilot instructions, and related tests to reflect the supported managed scraper integrations only.
- History date keys are zero-padded `YYYY-MM-DD` and unpadded keys are normalised on read; migration `1773000000000` rewrites existing keys.
- Keywords have a unique index on domain, keyword, country, location and device (migration `1775000000000`). Duplicate rows are merged, keeping the one with the most history and merging tags. Concurrent duplicate inserts return 409.
- Stale `updating` keyword flags are reset on upgrade (migration `1776000000000`) and expire after 30 minutes.
- Refresh retries a failed keyword at most 3 times. A locked domain is skipped instead of failing the whole batch; 409 is returned only if nothing could start.
- `GET /api/refresh?keyword=` is limited to 20 searches per client address per minute.
- The cron worker re-reads schedule changes when `settings.json` changes (file watch plus a 30 minute safety check). Weekly and monthly emails run at the email schedule time.
- `PUT /api/settings` merges partial payloads: keys left out keep their stored values, and a secret left out keeps its stored value.
- Bulk keyword actions send IDs in the request body; the query form is still accepted.
- The screenshots flag is read at runtime from `/api/branding/config` (`SCREENSHOTS` or `NEXT_PUBLIC_SCREENSHOTS`).
- Notification emails go only to each domain's own address. Migration `1774000000000` copies the old global address onto domains that had none.
- Docker: image adds a `HEALTHCHECK` and `HOSTNAME=0.0.0.0`; the entrypoint supervises web and cron and forwards signals; `docker-compose.yml` reads values from `.env` and has no hard-coded app URL.
- Dependencies: TypeScript 5.9 and `@types/node` 24.
- Serper sends the country code as lowercase.

### Removed
- The global Notification Emails setting. Per-domain notification emails are used instead (see Changed).
- The per-domain `notification_interval` column (migration `1777000000000`); the global notification interval setting is used.
- The `moment`, `eslint-config-next` and `@humanfs/node` dependencies.
- The unused `scrape_smart_full_fallback` column on the `domain` table, left over from the Smart strategy. New migration `1790000000000-drop-domain-scrape-smart-full-fallback` drops it (skipped when the column is missing, and the database is backed up first).
- The `skipped` placeholder entries in keyword results. Pages are fetched in order and positions are numbered without gaps, so stored results only hold scraped entries. The details panel no longer draws skipped blocks or the scraped/skipped banner; the "Not in First N" count is unchanged. Results stored by older versions may still show placeholder rows until the keyword is refreshed.

### Bug Fixes
- A corrupt retry queue file no longer takes the app down. It is renamed once to `failed_queue.json.corrupt-<time>` and the queue continues empty.
- Startup now clears any keyword `updating` flags left set by a previous process (e.g. a container restart mid-scrape), so the UI no longer shows stuck loading spinners after a restart.
- The research page domain selector shows the chosen domain. It previously stayed on "Select a Domain" after a pick, even though the chosen domain was used for Add and Email.
- The Domain Settings tabs stay on one row and shrink on narrow screens, instead of showing horizontal and vertical scrollbars.
- The logo and back button show in the top bar on every page.
- The cron worker receives shutdown signals directly instead of through the `npx` wrapper.
- The research page requires login. Google Ads OAuth returns to `/domains?ads=...`, and the result is handled there.
- Table layouts no longer show blank lists at 640-767px. Sort labels match the real order, and the ideas alphabetical sort and Favorites tab work.
- Settings keep unsaved edits when refetched. Search Console and console-page averages are weighted by impressions.
- The CSV export is UTF-8 with CRLF line endings and quoted values, and large numbers keep all their digits.

### Performance
- Reduced per-request scrape retry attempts from 3 to 1 so failing keywords fall through to the hourly failed-queue retry faster instead of blocking on repeated in-request retries.

### Configuration
- Increased the ValueSerp scraper timeout from 35 to 120 seconds to reduce aborted requests on slow API responses.

### Documentation
- README corrected against the code: install and migration steps, Docker volume backup, Node.js support, the environment variable reference, provider Mobile support and Serply and Serper limits, scrape strategy and parallel refresh behaviour, cron and digest schedules, the sign-in and API-key lockouts, error codes and session-only routes.
- README adds sections on how the domain average position is calculated, the keyword CSV export, continuous integration, project structure and credits.

# [4.0.0](https://github.com/djav1985/v-serpbear/compare/v3.0.0...v4.0.0) (2026-01-27)

### Features
- Daily notification email now surfaces a tracker mini-summary ahead of the Search Console tables, styled to match the dashboard tracker card and only showing the Map Pack column when the active scraper supports it.
- White-label deployments can override the platform name and supply a `/app/data` logo that propagates through the UI, emails, and Docker environment defaults.
- Added CrazySERP scraper integration.
- Added dynamic scraping strategy modes (`Basic`, `Custom`, and `Smart`) to control provider selection behavior.
- Keyword ideas banner now offers an email action on both research and domain idea tabs, formatting selected ideas into a rich HTML table and bypassing notification throttling while still enforcing domain-specific recipients.
- Keyword details panel now visualises skipped SERP positions as labelled page-range placeholders between real result cards. An inline banner reports the scraped vs. skipped counts, and the "not found" badge adapts to reflect the actual number of results checked rather than always displaying "No Results".

### Documentation
- Documented the fork's stability, security, and performance improvements at the top of the README for quick comparison with upstream SerpBear.
- Clarified that local development must use Node.js 20.18.1+ to align with the `.nvmrc` pin and dependency requirements.
- Documented refresh queue concurrency controls and per-domain locking behavior in the README configuration reference.
- Clarified README guidance that Google Ads and SMTP credentials are managed in Settings rather than environment variables, and that LOG_SUCCESS_EVENTS/NEXT_REMOVE_CONSOLE are currently unused.

### Build
- Adopted `@stylistic/stylelint-plugin` and upgraded Stylelint tooling to v16 so indentation rules continue working under the plugin namespace.
- Bumped the application version to 4.0.0 across manifests, UI footer defaults, and versioned tests.
- Aligned Docker build and type-checking scripts with the current TypeScript toolchain so CI and image builds run against the corrected typings.

### Bug Fixes
- Expanded the notification email template container so digest tables render wider in supporting clients.
- Search Console digest tables now scope tracker-specific keyword column styles and apply dedicated widths so the label column stays left-aligned while Clicks, Views, and Position stack neatly.
- Clarified regression coverage to assert the camelCase `mapPackTop3` keyword property rather than the legacy snake_case flag.
- Tracker mini stats in notification emails stay side-by-side on mobile by removing the block layout override while keeping tighter padding for small screens.
- Ensured keyword refresh cleanup always persists `updating` resets even when Sequelize instances still hold stale values after bulk updates, so failed scrapes no longer leave rows stuck in a loading state.
- Cleared ESLint warnings by wiring width/min-width props into UI components, surfacing settings errors inline, sanitising SMTP TLS hostnames, and logging caught exceptions throughout Ads/Search Console utilities and API handlers.
- Fixed the Google Ads keyword ideas mutation so successful requests no longer throw a runtime reference error and now properly invalidate the cached query for the active domain.
- Tracker email summary now falls back to live keyword data to compute average position and map-pack totals, preventing those counters from showing 0 when domain aggregates are unavailable.
- Tracker email summary now respects persisted Map Pack totals when available while still deriving a fallback from live keyword data for domains without the stored value.
- Domain stats retrieval now omits average position and map-pack counts unless persisted values exist, avoiding stale recalculations from keyword snapshots.
- Corrected TypeScript types for `failed_queue`, `proper-lockfile`, and `logger.error`, unblocking the Docker production build by eliminating the associated type errors.
# [3.0.0](https://github.com/djav1985/v-serpbear/compare/v2.0.7...v3.0.0) (2025-09-24)

### Features
- Domains dashboard “Map Pack” tracker counter showing keywords in the local pack.
- Map-pack membership propagation through API, UI, and emails with stacked CSS badge (`map-pack.png`).
- Shortened map-pack email badge label from "MAP" → "MP".
- Manual “Send Notifications Now” action in Notification settings, with success/error toasts and ARIA support.
- Reusable page loader overlay and spinner placeholders across dashboard, domain, and research views.
- Optional SMTP TLS certificate hostname override to fix validation issues.
- SERP charts now auto-zoom with dynamic chart bounds.
- Configurable cron timezone and schedule environment variables.
- Unified Active/Deactive toggle replacing separate scrape/notify switches.
- Refreshed TopBar layout for mobile edge-to-edge.
- Replaced fixed 105 rem layout cap with responsive desktop-container utility.
- Returned HTML OAuth callback from `/api/adwords` that posts `adwordsIntegrated`.
- Centralised Google Ads API version behind `GOOGLE_ADS_API_VERSION`.
- Rebuilt multi-stage Dockerfile to preserve `/app/data` and simplify cron startup.
- Refreshed Docker Compose example with new defaults.
- Automatically refreshes Search Console data and fall back to global credentials when domain-specific credentials are unavailable.
- Added manual refresh button for Search Console data.
- Centralized `react-hot-toast` provider for consistent toast handling across the app.
- Added state-based location targeting feature.
- Added debugging logs to `getAdwordsKeywordIdeas` for improved keyword processing insight.

### Bug Fixes
- Treated empty Google Ads keyword-idea responses as 404s; bubbled errors and redirected on 401s.
- `/api/notify` now reserves 401 for auth failures, 400 for SMTP misconfig, 500 for delivery errors.
- Fixed keyword flag coercion so `'0'/'false'` values no longer lock spinners.
- Hardened domain screenshot caching against corrupted `domainThumbs`.
- Hardened `/api/refresh` error handling for empty IDs, scraper failures, and disabled domains.
- Normalised SQLite boolean bindings for domain toggles.
- Normalised keyword creation and history persistence (always JSON).
- Normalised Google SERP extraction (resolves `/url` and `/interstitial`).
- Hardened settings API for missing runtime config and default fallbacks.
- Domain validation regex fixes and extra test coverage.
- Domain settings now hydrate from canonical host; tolerate null domains.
- Removed redundant domain guards and client-side blank slug rejection.
- Fixed mistyped `RefreshResult` import.
- Search Console now caches daily summaries, tolerates missing/invalid data, and refetches on slug change.
- Updated Serply scraper to use query-string params.
- Updated ValueSerp scraper to drop hard-coded `num=100`.
- Encoded ScrapingRobot locale params.
- Ensured AdWords volume updates await DB writes and bubble errors.
- Updated API handlers to return proper HTTP error payloads.
- Fixed session cookie expiry handling so configured durations are respected and logout immediately clears authentication cookies.
- Hardened Google Ads refresh-token retrieval when error payloads omit an `error` string.
- Prevented Search Console cache filenames for hyphenated domains from colliding with dotted domains.
- Hardened API ID validation and corrected domain responses.
- Added default empty strings for domain-related model fields.
- Wrapped scraper and keyword JSON parsing with error handling.
- Removed stray console logs and simplified Jest polyfills.
- Fixed multiple React errors (#418, #423) by updating `Next.js` Link components and resolving SSR/hydration mismatches.
- Fixed TopBar back button vertical alignment issue.
- Fixed `[object Object]` error in Docker logs by improving error handling in cron and scraping functionality.
- Fixed domain slug conversion logic to ensure correct usage in database and Search Console queries.
- Fixed keyword loading bug causing Google Ads API requests to fail due to domain query mismatches.
- Fixed typo in `keywordPayload` and API logic for keyword ideas generation.
- Fixed keyword ideas API "invalid value" errors and improved handling of unused parameters.
- Fixed domain name handling in keyword ideas for Search Console and tracked keywords.
- Improved keyword idea error handling to prevent API failures.
- Fixed mobile menu behavior issues.
- Fixed anchor domain header dropdown positioning above selector.
- Refactored keyword location display for better readability.
- Fixed GitHub workflow permissions and patched XSS vulnerability in Adwords API.
- Multiple minor UI and accessibility fixes for domain header, menus, and forms.

### Code Quality & Maintenance
- Raised ESLint `max-len` to 200, relaxed complexity to warning at 60.
- Delegated unused-var checks to `@typescript-eslint`.
- Replaced Icon component’s 50-branch conditional with renderer map.
- Exported keyword filter predicates with Jest coverage.
- Removed trailing commas from configs/migrations.
- Removed unused `winston` dependency.
- Pinned stylelint and upgraded `stylelint-config-standard` to ^34.0.0.
- ESLint version shuffle: downgraded to ^8.57.1 for Airbnb base, later upgraded to v9 flat config.
- ESLint/Git attributes now ignore `.next` build artifacts.
- Removed deprecated `sqlite3`, added better-sqlite3 dialect wrapper.
- Enhanced mocked better-sqlite3 driver for positional params.
- Trimmed undefined/null args in SQLite shim.
- Updated custom SQLite dialect to call `run()` for non-reader statements.
- Consolidated scraper/refresh error serialization helper.
- Documented new env flags in `.env.example` and README.
- Restructured `README.md` with product overview, env refs, and provider comparison.
- Removed in-app changelog panel; footer now shows version only.
- Enabled GitHub Actions concurrency groups and Docker build cache exports.
- Removed package manifests and Docker health probe from runtime container.
- Added root `.editorconfig` for consistency.
- Added least-privilege CodeQL workflow for JS/TS.
- Added `npm run setup:git` helper for branch setup.
- Bundled `sequelize-cli` as prod dep; migrated Sequelize → Umzug v3.
- Preserved explicit SQLite null bindings.
- Jest stubs for `window.location`.
- Resolved all ESLint linting errors across the codebase.
- Enhanced code quality with comprehensive linting rules and security checks.
- Removed nested ternaries and improved code readability in keyword tables.
- Fixed trailing commas, stray quotes, typos, and minor formatting inconsistencies.
- Increased z-index for domain header action menu.
- Adjusted mobile responsiveness across components.
- Displayed keyword location in emailed reports.
- Adjusted daily email cron to run at 1 PM.
- Multiple dependency updates and security patches.

### [2.0.7](https://github.com/towfiqi/serpbear/compare/v2.0.6...v2.0.7) (2025-02-23)

### Bug Fixes

- Resolves AdWords integration issue. ([36ed4cf](https://github.com/towfiqi/serpbear/commit/36ed4cf800c1fd0e3df4e807faaa1fdb863df5e4))
- resolves broken CDN images. ([bf911b4](https://github.com/towfiqi/serpbear/commit/bf911b4e45b9007a05ce6399838da3276161c61d))

### [2.0.6](https://github.com/towfiqi/serpbear/compare/v2.0.5...v2.0.6) (2024-11-15)

### Bug Fixes

- Ensures Docker build uses matching npm package versions from package.json ([4fef1a9](https://github.com/towfiqi/serpbear/commit/4fef1a9abc737da67ab1ea0c4efce8194890545e))
- Resolves broken Docker build due to croner package version mismatch. ([aeed1f8](https://github.com/towfiqi/serpbear/commit/aeed1f8559e044bf658d930a22fa91f38cfedc6b)), closes [#247](https://github.com/towfiqi/serpbear/issues/247)
- Resolves broken Proxy Scraper functionality. ([649f412](https://github.com/towfiqi/serpbear/commit/649f412303dd50127b3736740962863f735f76eb)), closes [#248](https://github.com/towfiqi/serpbear/issues/248)
- Resolves Google Ads search volume data loading issue. ([12eac2b](https://github.com/towfiqi/serpbear/commit/12eac2b01235e9eae06882d6a2c50c793b890661))

### [2.0.5](https://github.com/towfiqi/serpbear/compare/v2.0.4...v2.0.5) (2024-11-12)

### Bug Fixes

- Fixes broken scrape result issue for keywords with special characters. ([d9d7c63](https://github.com/towfiqi/serpbear/commit/d9d7c6347e99e35f1e48f20b1e8f999612d69a72)), closes [#221](https://github.com/towfiqi/serpbear/issues/221)
- Fixes misaligned Keywords table UI content. ([faa3519](https://github.com/towfiqi/serpbear/commit/faa3519a29fc61ef8bd2ce9275a6674f1c7946e0))
- Resolves "Add Domain" UI confusion. ([17fb2c4](https://github.com/towfiqi/serpbear/commit/17fb2c40cc6b57ab2fe6aeb940dececd1a83411f))
- Resolves broken Scrapingrobot scraper on new installs. ([bc02c92](https://github.com/towfiqi/serpbear/commit/bc02c929ba7efd6b4b6a09495af7310c155a26bd)), closes [#243](https://github.com/towfiqi/serpbear/issues/243)

### [2.0.4](https://github.com/towfiqi/serpbear/compare/v2.0.3...v2.0.4) (2024-11-10)

### Bug Fixes

- Fixes Docker build issue. ([1bef758](https://github.com/towfiqi/serpbear/commit/1bef7587cccada6df48cfa3d208bf123a5d00c30))

### [2.0.3](https://github.com/towfiqi/serpbear/compare/v2.0.2...v2.0.3) (2024-11-10)

### Features

- Ability to keywords for both mobile and desktop at once. ([3786438](https://github.com/towfiqi/serpbear/commit/3786438662f015613330912f668c161f007f3eef)), closes [#60](https://github.com/towfiqi/serpbear/issues/60) [#66](https://github.com/towfiqi/serpbear/issues/66) [#199](https://github.com/towfiqi/serpbear/issues/199)
- Adds ability to set Notification Email From name. ([b35d333](https://github.com/towfiqi/serpbear/commit/b35d333bfcdf0765bd105f74c8b324aec6d98b22)), closes [#222](https://github.com/towfiqi/serpbear/issues/222)
- Adds the ability to show hide columns in tracked keywords table. ([d3e3760](https://github.com/towfiqi/serpbear/commit/d3e37605279c48f7a56b2ef5125c32a00b948e05)), closes [#224](https://github.com/towfiqi/serpbear/issues/224)
- auto filter keywords if they already exist instead of throwing error. ([a09eb62](https://github.com/towfiqi/serpbear/commit/a09eb62f5a65f584c32ddb5c46018dc404d3e1f3)), closes [#244](https://github.com/towfiqi/serpbear/issues/244)
- Displays Best position on mobile layout as well. ([a74338f](https://github.com/towfiqi/serpbear/commit/a74338fe15bee0fbc65a5197ee56db5d6a629bc8))
- Displays keyword's best position in email notification. ([4c2f900](https://github.com/towfiqi/serpbear/commit/4c2f900d85e56b1994630942c9ea53d0fd0b4cdb))
- Keywords Country filter now only shows relevant countries. ([a050536](https://github.com/towfiqi/serpbear/commit/a0505368140076d6626647993a41a5f4ef9db019))
- Makes Content width a little wider. ([42c5e2b](https://github.com/towfiqi/serpbear/commit/42c5e2be0777a1bd72aa53bdf3c211075793a6e8))

### Bug Fixes

- Correct CTR calculation in InsightStats component ([232507e](https://github.com/towfiqi/serpbear/commit/232507e1ff7519cfc82f3818d3b757f2c427b52a))
- Fixes incorrect position display in keyword detail view when position is above 100 ([01b1b7b](https://github.com/towfiqi/serpbear/commit/01b1b7b9e9c603e470217ad476dd54359d7d35b8))
- Fixes missing keyword city value in exported csv file. ([f482884](https://github.com/towfiqi/serpbear/commit/f48288473e910c00e7c9178366a394e891bc47c7)), closes [#194](https://github.com/towfiqi/serpbear/issues/194)
- Fixes missing Search Console data in Email notification when its integrated through App settings. ([040dab1](https://github.com/towfiqi/serpbear/commit/040dab15177d81874a6eb89f913a450f8a6f212d))
- Resolves incorrect search trend graph in Ideas section. ([7597210](https://github.com/towfiqi/serpbear/commit/7597210ca2018b4abc82d441d2fc871e46295307)), closes [#219](https://github.com/towfiqi/serpbear/issues/219)
- Resolves notification email's incorrect image size in some email clients. ([bc96dc7](https://github.com/towfiqi/serpbear/commit/bc96dc7de50844fbda19a89961c36cc65ac0b97b)), closes [#201](https://github.com/towfiqi/serpbear/issues/201)
- update scraping robot typo in README ([c24b630](https://github.com/towfiqi/serpbear/commit/c24b63009c48c61218ea96511b11fe1a4f2ff239))

### [2.0.2](https://github.com/towfiqi/serpbear/compare/v2.0.1...v2.0.2) (2024-03-13)

### Bug Fixes

- Resolves Broken Google Adwords Authentication in Docker containers. ([1d0a788](https://github.com/towfiqi/serpbear/commit/1d0a78881039b3ebd4b1e00fb067016886d49c31)), closes [#179](https://github.com/towfiqi/serpbear/issues/179)

### [2.0.1](https://github.com/towfiqi/serpbear/compare/v2.0.0...v2.0.1) (2024-03-06)

### Bug Fixes

- Resolves broken doc links ([d48ae76](https://github.com/towfiqi/serpbear/commit/d48ae76103615ab82a32cbd8ffa62e27d17999de))
- Resolves keyword loading issue in Docker instances. ([4a87d22](https://github.com/towfiqi/serpbear/commit/4a87d229fee7aa5e0ca8b2042c168465c7c5d67f)), closes [#178](https://github.com/towfiqi/serpbear/issues/178)

## [2.0.0](https://github.com/towfiqi/serpbear/compare/v1.0.3...v2.0.0) (2024-03-05)

### Features

- Adds a Keyword Research Section. ([4d15989](https://github.com/towfiqi/serpbear/commit/4d15989b2832c3514fca18f3178a967c1fc9ad18))
- Adds ability to pick existing tags when applying keyword tags. ([407ab8d](https://github.com/towfiqi/serpbear/commit/407ab8db831b26a5d45ccd7455c39f82fef1e438)), closes [#171](https://github.com/towfiqi/serpbear/issues/171)
- Adds Google Adwords Integration to allow generating Keyword Ideas. ([5650645](https://github.com/towfiqi/serpbear/commit/5650645b58638e91bd5772415234fdda8cc8de1a))
- Adds keyword search volume data feature for tracked keywords. ([2a1fc0e](https://github.com/towfiqi/serpbear/commit/2a1fc0e43d31f215b815a9d8b312da080209ae3a))
- Adds the ability to view the changelog and displays the latest version number. ([bb4a684](https://github.com/towfiqi/serpbear/commit/bb4a6844b522067b69a007fda427d16d25bae3a3))

### Bug Fixes

- Resolves Domain keyword Ideas generation issue. ([252ae9a](https://github.com/towfiqi/serpbear/commit/252ae9aa84177909f5658d954ca1231c70cb9145))
- Resolves minor UI bugs. ([50160f5](https://github.com/towfiqi/serpbear/commit/50160f5b234fc783802efae34db4a8f959745998))

### [1.0.3](https://github.com/towfiqi/serpbear/compare/v1.0.2...v1.0.3) (2024-02-22)

### Bug Fixes

- Resolves App not reloading on Scraper setup. ([56ffbf5](https://github.com/towfiqi/serpbear/commit/56ffbf59d1e459a6c7229d141ccc6774dc8055d0))
- Resolves large keywords breaking the keywords table ui ([724d3c8](https://github.com/towfiqi/serpbear/commit/724d3c8d4309c7bd4f40e9db980ad54f99023d35))
- Resolves scraper not able to scrape some keywords correctly. ([9a7a43f](https://github.com/towfiqi/serpbear/commit/9a7a43f051387cacc13116c0a7c21716b54e539b))

### [1.0.2](https://github.com/towfiqi/serpbear/compare/v1.0.1...v1.0.2) (2024-02-15)

### Bug Fixes

- Resolves Incorrect Position issue. ([0e64b95](https://github.com/towfiqi/serpbear/commit/0e64b95cd5303525535ea84a77181281d7f5618e)), closes [#164](https://github.com/towfiqi/serpbear/issues/164)

### [1.0.1](https://github.com/towfiqi/serpbear/compare/v1.0.0...v1.0.1) (2024-02-13)

### Bug Fixes

- Resolves the app crash issue when there is no database. ([e5dd411](https://github.com/towfiqi/serpbear/commit/e5dd411aa9aef58ebb226f2b793a2632ab9069a7)), closes [#161](https://github.com/towfiqi/serpbear/issues/161) [#162](https://github.com/towfiqi/serpbear/issues/162)

## [1.0.0](https://github.com/towfiqi/serpbear/compare/v0.3.4...v1.0.0) (2024-02-09)

### Features

- Adds Serper.dev integration ([b4ad69b](https://github.com/towfiqi/serpbear/commit/b4ad69baaa0f865938f8b0eace6732a9e6b1b381)), closes [#138](https://github.com/towfiqi/serpbear/issues/138)
- Adds the ability for city level scraping for scapers that allow it. ([3719f21](https://github.com/towfiqi/serpbear/commit/3719f21d98d173219cef5656579fa0e5340ccdbf)), closes [#139](https://github.com/towfiqi/serpbear/issues/139) [#151](https://github.com/towfiqi/serpbear/issues/151)
- adds the ability to add url as a domain. ([3c2a1b8](https://github.com/towfiqi/serpbear/commit/3c2a1b8a5b8a2a4a2179a5031582f8202c2e494a)), closes [#53](https://github.com/towfiqi/serpbear/issues/53) [#90](https://github.com/towfiqi/serpbear/issues/90) [#119](https://github.com/towfiqi/serpbear/issues/119)
- Adds the Ability to set Search Console Property type via Domain Settings. ([b2e97b2](https://github.com/towfiqi/serpbear/commit/b2e97b2ebec380f0edf7ddc0640c2126eff006ac)), closes [#50](https://github.com/towfiqi/serpbear/issues/50)
- Adds the ability to setup Search Console through the UI. ([f04b10c](https://github.com/towfiqi/serpbear/commit/f04b10cf6b065e3023965112a60e0aa702212a4b)), closes [#59](https://github.com/towfiqi/serpbear/issues/59) [#146](https://github.com/towfiqi/serpbear/issues/146)
- Adds ValueSerp Integration. ([1041cb3](https://github.com/towfiqi/serpbear/commit/1041cb3c0bb69e9034696624e03433be28e83ac6)), closes [#105](https://github.com/towfiqi/serpbear/issues/105) [#106](https://github.com/towfiqi/serpbear/issues/106)

### Bug Fixes

- Resolves Keywords filter crashing issue. ([633ab2c](https://github.com/towfiqi/serpbear/commit/633ab2c467be5b7b86d4547ae0c59034e595a42d))
- Resolves missing Keyword Loading Spinner issue. ([dbf540c](https://github.com/towfiqi/serpbear/commit/dbf540cfdb16ddb02c9d26618e3680d34799f57f))

### [0.3.4](https://github.com/towfiqi/serpbear/compare/v0.3.3...v0.3.4) (2024-01-15)

### Features

- adds ability to add multiple domains at once. ([faa88c9](https://github.com/towfiqi/serpbear/commit/faa88c92542194f19b5cfe2b5cfd07d7d4f7ee46))
- Adds the ability to show/hide Keys & Passwords in Settings Panel ([c897a52](https://github.com/towfiqi/serpbear/commit/c897a525509baf5b9e8df18d82f5e87aec64f66e))

### Bug Fixes

- fixes local SC data not being removed on deleting domain. ([cca9f95](https://github.com/towfiqi/serpbear/commit/cca9f95358b2d3ea06edb33595cdbf616a175469))
- Resolves incorrect keyword average SC data values in Tracker ([e166b58](https://github.com/towfiqi/serpbear/commit/e166b588aa6c8db55d61b5bc13db66514575c745))
- resolves newly added Domain's Update time rendering issue ([df3a738](https://github.com/towfiqi/serpbear/commit/df3a738788fa957e7246a0feefe395a9eadd5baf))

### [0.3.3](https://github.com/towfiqi/serpbear/compare/v0.3.2...v0.3.3) (2023-11-12)

### Features

- Adds ability to visit pages from Insight tab ([60c68bd](https://github.com/towfiqi/serpbear/commit/60c68bd339db7aeed35aea035dd21691702ffee3))
- Domains now show their favicon. ([2339e31](https://github.com/towfiqi/serpbear/commit/2339e31af9e90bf918f5bcd4f23114f38cef0313)), closes [#130](https://github.com/towfiqi/serpbear/issues/130)
- Shows total keywords count in domains page ([fbd23ed](https://github.com/towfiqi/serpbear/commit/fbd23ede256062c72ec2f7e3983a0a02f0240725))

### Bug Fixes

- Resolves Website Thumbnail missing issue ([4a60271](https://github.com/towfiqi/serpbear/commit/4a60271cac1209dc02748c4d31943bb21c9ecaf2)), closes [#131](https://github.com/towfiqi/serpbear/issues/131)

### [0.3.2](https://github.com/towfiqi/serpbear/compare/v0.3.1...v0.3.2) (2023-11-09)

### Bug Fixes

- Resolves issue with adding long tld emails ([9b9b74a](https://github.com/towfiqi/serpbear/commit/9b9b74af4c249e27458d29ba052e96ab2db8b640)), closes [#127](https://github.com/towfiqi/serpbear/issues/127)

### [0.3.1](https://github.com/towfiqi/serpbear/compare/v0.3.0...v0.3.1) (2023-11-04)

### Bug Fixes

- Removes dev files from docker volumes ([454454a](https://github.com/towfiqi/serpbear/commit/454454a422bab4d37a2d43ad95868e293a97b88e))
- Updates vulnerable dependencies ([97dd0b1](https://github.com/towfiqi/serpbear/commit/97dd0b131be4cec73d07f35062334dd1881f0013))

## [0.3.0](https://github.com/towfiqi/serpbear/compare/v0.2.6...v0.3.0) (2023-11-03)

### Features

- Adds ability to disable/clear retry queue for failed keywords ([dc3c7a7](https://github.com/towfiqi/serpbear/commit/dc3c7a722b18248115969c51f2495ccf1c43926d))
- Adds ability to search w/o case sensitivity ([4748ffc](https://github.com/towfiqi/serpbear/commit/4748ffc382161c5d861b8d43e8eba466a031e2bc)), closes [#115](https://github.com/towfiqi/serpbear/issues/115)
- Displays the Best position of the keywords ([fc183d2](https://github.com/towfiqi/serpbear/commit/fc183d246d55e0eecf43c91f6da8a59192e8e771)), closes [#89](https://github.com/towfiqi/serpbear/issues/89)
- Refresh All feature now shows update real-time ([1d6b2be](https://github.com/towfiqi/serpbear/commit/1d6b2be95aa133b7998f5cf098f15aa32f5badd2))
- Remembers last selected coutry ([d3d336f](https://github.com/towfiqi/serpbear/commit/d3d336fa71cc789624b10f3cdd1a2b5983053e6f)), closes [#101](https://github.com/towfiqi/serpbear/issues/101)

### Bug Fixes

- Resolves missing keyword scrape spinner issue ([f57bca2](https://github.com/towfiqi/serpbear/commit/f57bca23daa3fe888af4c19a681dcec6b6100d83))
- Cron stopped on failing to parse failed queue ([8a949ce](https://github.com/towfiqi/serpbear/commit/8a949ce4c078ff377e91a95c4b86ef2b15dae88b)), closes [#116](https://github.com/towfiqi/serpbear/issues/116)
- Fixes import order error in some instances. ([be80ed7](https://github.com/towfiqi/serpbear/commit/be80ed7ef3dd0a315c5ad67d17e61a4797dc274c)), closes [#114](https://github.com/towfiqi/serpbear/issues/114)
- Fixes issue with adding hyphenated subdomains. ([c0470cf](https://github.com/towfiqi/serpbear/commit/c0470cfa9d0dac86317c886065b461cfe82ffb16))
- Fixes the weekly cron day issue. ([392122a](https://github.com/towfiqi/serpbear/commit/392122a7101683342830e900c6f0c39f9272bb34)), closes [#118](https://github.com/towfiqi/serpbear/issues/118)
- Fxies special character keyword scrape issue. ([9feff13](https://github.com/towfiqi/serpbear/commit/9feff13f18a4d72203dde694a147831f990b37fb)), closes [#113](https://github.com/towfiqi/serpbear/issues/113) [#122](https://github.com/towfiqi/serpbear/issues/122)

### [0.2.6](https://github.com/towfiqi/serpbear/compare/v0.2.5...v0.2.6) (2023-03-29)

### Features

- Add option to Delay Between scrapes. ([0a83924](https://github.com/towfiqi/serpbear/commit/0a83924ffe2243c52849c167c6c15d9688ff1dc7)), closes [#87](https://github.com/towfiqi/serpbear/issues/87)
- Integrates Space Serp. ([0538a8c](https://github.com/towfiqi/serpbear/commit/0538a8c01601d2f6365848580591a248528e67c7))

### Bug Fixes

- **components:** fix typo "Goolge" -> "Google" ([dce7c41](https://github.com/towfiqi/serpbear/commit/dce7c412e813fc845973f36ad1c9fa91df4a6611))
- Fixes first Keryword Error cut off issue. ([d950515](https://github.com/towfiqi/serpbear/commit/d9505158c439a924a1c86eb8243faf2a15bed43e))
- Fixes lags when tracking thousands of keywords ([9757fde](https://github.com/towfiqi/serpbear/commit/9757fde02ec83405546733381104c54ed6510681)), closes [#88](https://github.com/towfiqi/serpbear/issues/88)

### [0.2.5](https://github.com/towfiqi/serpbear/compare/v0.2.4...v0.2.5) (2023-03-07)

### Features

- Adds current App version Number in Footer. ([b83df5f](https://github.com/towfiqi/serpbear/commit/b83df5f3dbd64db657d31f0526438e7165e1b475))
- Adds Keyword Scraping Interval Settings. ([3b6d034](https://github.com/towfiqi/serpbear/commit/3b6d034d6f7da0b4259070220fffff44184dd680)), closes [#81](https://github.com/towfiqi/serpbear/issues/81) [#76](https://github.com/towfiqi/serpbear/issues/76)

### Bug Fixes

- Fixes Broken Image thumbnail loading issue. ([5dd366b](https://github.com/towfiqi/serpbear/commit/5dd366b91e2a94e658bf5250a8a0fa64c09e1c11))
- Settings Update Toast was not showing up. ([b9d58a7](https://github.com/towfiqi/serpbear/commit/b9d58a721df12f3f34220a3ae5da6897e23c83ec))

### [0.2.4](https://github.com/towfiqi/serpbear/compare/v0.2.3...v0.2.4) (2023-02-15)

### Features

- Keyword ranking pages can now be clicked. ([c5af94a](https://github.com/towfiqi/serpbear/commit/c5af94a1469713ed4092253d26953ee0ed28c25d))

### Bug Fixes

- Fixes broken Login on windows ([c406588](https://github.com/towfiqi/serpbear/commit/c406588953035e4177a64011c13eb0e3aedffe89))
- Fixes Node Cron memory leak issue. ([3c48d13](https://github.com/towfiqi/serpbear/commit/3c48d130b6f229a4ac27ec43ef1ea3a6640cecf6))

### [0.2.3](https://github.com/towfiqi/serpbear/compare/v0.2.2...v0.2.3) (2023-01-12)

### Features

- Ability to tag multiple keywords at once ([9e9dad7](https://github.com/towfiqi/serpbear/commit/9e9dad7631691b2a836fdd4c522b1f933b17e285)), closes [#54](https://github.com/towfiqi/serpbear/issues/54)
- Set USERNAME as well as USER variable ([b50733d](https://github.com/towfiqi/serpbear/commit/b50733defc2c06e0f92ca3e88fd1f74684eee9c0))

### Bug Fixes

- Fixes Position and View Sort. ([8139e39](https://github.com/towfiqi/serpbear/commit/8139e399c13ab8be767facef9a19c67dec06ed64)), closes [#46](https://github.com/towfiqi/serpbear/issues/46)
- Fixes wrong CTR value for Search Console Data ([cb24696](https://github.com/towfiqi/serpbear/commit/cb24696a1f47b02a11c68cd1c673ea8b1bacd144)), closes [#48](https://github.com/towfiqi/serpbear/issues/48)
- Mobile Keyword Scraping not working. ([a1108d2](https://github.com/towfiqi/serpbear/commit/a1108d240ea38ab0886ef3722b0c937ec5a45591)), closes [#58](https://github.com/towfiqi/serpbear/issues/58)
- ScrapingAnt Mobile Keyword Scrape not working ([acc0b39](https://github.com/towfiqi/serpbear/commit/acc0b39d80d4f9371967a0d425ed205c5d866eea))

### [0.2.2](https://github.com/towfiqi/serpbear/compare/v0.2.1...v0.2.2) (2022-12-25)

### Bug Fixes

- Fixes bug that prevents Saving API settings ([123ad81](https://github.com/towfiqi/serpbear/commit/123ad81dae10aa28848148d0f3da5cf1f7de7c57)), closes [#45](https://github.com/towfiqi/serpbear/issues/45)

### [0.2.1](https://github.com/towfiqi/serpbear/compare/v0.2.0...v0.2.1) (2022-12-24)

## [0.2.0](https://github.com/towfiqi/serpbear/compare/v0.1.7...v0.2.0) (2022-12-21)

### Features

- Adds better error logging for debugging issues ([9b71f84](https://github.com/towfiqi/serpbear/commit/9b71f8400bc17b75722b93cbe745543f6b30814a))
- Highlights tracked keywords in Discovery tab ([ee32435](https://github.com/towfiqi/serpbear/commit/ee32435d05c2a2ec6d446cd00e28058f07eb1ad4))
- Integrate SerpApi ([ad6a354](https://github.com/towfiqi/serpbear/commit/ad6a354cb93bc6584d71dd1216a8a03d8dba505b))
- integrates Google Search Console. ([49b4769](https://github.com/towfiqi/serpbear/commit/49b4769528d18e34c16386b73dfb662e7a9f45a0))

### Bug Fixes

- Ability to add SMTP without user/pass. ([671f89e](https://github.com/towfiqi/serpbear/commit/671f89e492b0f45d63ae7575c7d4970252c11296)), closes [#30](https://github.com/towfiqi/serpbear/issues/30)
- backend error on addind new domain ([c2b6328](https://github.com/towfiqi/serpbear/commit/c2b63280cb9d66b565dc51eb69ee960710ace895))
- Backend error on loading the domains page. ([e3bd5b9](https://github.com/towfiqi/serpbear/commit/e3bd5b9c0735939c6b06e9762a3ad041b8b05d6e))
- Email Notification was not being sent. ([0fdb43c](https://github.com/towfiqi/serpbear/commit/0fdb43c0a53460cd35daabc4703d26cb11db9601))
- Fixes Docker Deployment failure after the SC integration. ([b0bfba4](https://github.com/towfiqi/serpbear/commit/b0bfba440464f8fc7c31609c202e01416a41702d))
- hides Search Console Stats if its not connected ([b740ef3](https://github.com/towfiqi/serpbear/commit/b740ef337bbfb43f63528cac891d4cb254318dc7))
- Keyword Detail View's broken Search Result ([6a1f1d4](https://github.com/towfiqi/serpbear/commit/6a1f1d4adff89fc718c0f2ffe52a59ab15ad6c80))
- Minor UI Issues. ([89824ec](https://github.com/towfiqi/serpbear/commit/89824ece2349b510fa0b7d87b33cacd2c88efc95))

### [0.1.7](https://github.com/towfiqi/serpbear/compare/v0.1.6...v0.1.7) (2022-12-08)

### Bug Fixes

- Email notifcations now sent everyday at 3am ([f000063](https://github.com/towfiqi/serpbear/commit/f00006371d56c509eae00a72e164658c84fecd00))
- shortens hours and minutes in notif emails ([480767d](https://github.com/towfiqi/serpbear/commit/480767deb24072f9e250e4dd7bd3d710c4b6046c))
- Throws better error logs in cron for debugging ([a6af9d3](https://github.com/towfiqi/serpbear/commit/a6af9d347544f847e512c4ae55b14c640a897240))

### [0.1.6](https://github.com/towfiqi/serpbear/compare/v0.1.5...v0.1.6) (2022-12-05)

### Bug Fixes

- CSS Linter issues. ([a599035](https://github.com/towfiqi/serpbear/commit/a59903551eccb3f03f2bc026673bbf9fd0d4bc1e))
- invalid json markup ([e9d7730](https://github.com/towfiqi/serpbear/commit/e9d7730ae7ec647d333713248b271bae8693e77b))
- Sort was buggy for keyword with >100 position ([d22992b](https://github.com/towfiqi/serpbear/commit/d22992bf6489b11002faba60fa06b5c467867c8b)), closes [#23](https://github.com/towfiqi/serpbear/issues/23)
- **UI:** Adds tooltip for Domain action icons. ([b450540](https://github.com/towfiqi/serpbear/commit/b450540d9593d022c94708c9679b5bf7c0279c50))

### [0.1.5](https://github.com/towfiqi/serpbear/compare/v0.1.4...v0.1.5) (2022-12-03)

### Features

- keyword not in first 10 now shows >10 ([e1799fb](https://github.com/towfiqi/serpbear/commit/e1799fb2f35ab8c0f65eb90e66dcda10b8cb6f16))

### Bug Fixes

- domains with - were not loading the keywords. ([efb565b](https://github.com/towfiqi/serpbear/commit/efb565ba0086d1b3e69ea71456a892ca254856f7)), closes [#11](https://github.com/towfiqi/serpbear/issues/11)
- failed scrape messes up lastResult data in db ([dd6a801](https://github.com/towfiqi/serpbear/commit/dd6a801ffda3eacda957dd20d2c97fb6197fbdc2))
- First search result items were being skipped. ([d6da18f](https://github.com/towfiqi/serpbear/commit/d6da18fb0135e23dd869d1fb500e12ee2e782bfa)), closes [#13](https://github.com/towfiqi/serpbear/issues/13)
- removes empty spaces when adding domain. ([a11b0f2](https://github.com/towfiqi/serpbear/commit/a11b0f223c0647537ab23564df1d2f0b29eef4ae))

### [0.1.4](https://github.com/towfiqi/serpbear/compare/v0.1.3...v0.1.4) (2022-12-01)

### Features

- Failed scrape now shows error details in UI. ([8c8064f](https://github.com/towfiqi/serpbear/commit/8c8064f222ea8177b26b6dd28866d1f421faca39))

### Bug Fixes

- Domains with www weren't loading keywords. ([3d1c690](https://github.com/towfiqi/serpbear/commit/3d1c690076a03598f0ac3f3663d905479d945897)), closes [#8](https://github.com/towfiqi/serpbear/issues/8)
- Emails were sending serps of previous day. ([6910558](https://github.com/towfiqi/serpbear/commit/691055811c2ae70ce1b878346300048c1e23f2eb))
- Fixes Broken ScrapingRobot Integration. ([1ed298f](https://github.com/towfiqi/serpbear/commit/1ed298f633a9ae5b402b431f1e50b35ffd44a6dc))
- scraper fails if matched domain has www ([38dc164](https://github.com/towfiqi/serpbear/commit/38dc164514b066b2007f2f3b2ae68005621963cc)), closes [#6](https://github.com/towfiqi/serpbear/issues/6) [#7](https://github.com/towfiqi/serpbear/issues/7)
- scraper fails when result has domain w/o www ([6d7cfec](https://github.com/towfiqi/serpbear/commit/6d7cfec95304fa7a61beaab07f7cd6af215255c3))

### [0.1.3](https://github.com/towfiqi/serpbear/compare/v0.1.2...v0.1.3) (2022-12-01)

### Features

- Adds a search field in Country select field. ([be4db26](https://github.com/towfiqi/serpbear/commit/be4db26316e7522f567a4ce6fc27e0a0f73f89f2)), closes [#2](https://github.com/towfiqi/serpbear/issues/2)

### Bug Fixes

- could not add 2 character domains. ([5acbe18](https://github.com/towfiqi/serpbear/commit/5acbe181ec978b50b588af378d17fb3070c241d1)), closes [#1](https://github.com/towfiqi/serpbear/issues/1)
- license location. ([a45237b](https://github.com/towfiqi/serpbear/commit/a45237b230a9830461cf7fccd4c717235112713b))
- No hint on how to add multiple keywords. ([9fa80cf](https://github.com/towfiqi/serpbear/commit/9fa80cf6098854d2a5bd5a8202aa0fd6886d1ba0)), closes [#3](https://github.com/towfiqi/serpbear/issues/3)

### 0.1.2 (2022-11-30)

### Bug Fixes

- API URL should be dynamic. ([d687109](https://github.com/towfiqi/serpbear/commit/d6871097a2e8925a4222e7780f21e6088b8df467))
- Email Notification wasn't working. ([365caec](https://github.com/towfiqi/serpbear/commit/365caecc34be4630241189d1a948133254d0047a))
