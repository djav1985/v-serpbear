# SerpBear

> Open-source search engine results page (SERP) monitoring, keyword research, and reporting for agencies and in-house marketers.

![SerpBear hero banner](https://i.imgur.com/0S2zIH3.png "SerpBear hero banner")

> _Some GitHub and self-hosted markdown viewers block remote images._ The hero banner above shows the SerpBear dashboard with keyword trend charts and key performance indicators for a sample domain. Even if the image fails to load, the rest of this README describes the same experience in detail.

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/7e7a0030c3f84c6fb56a3ce6273fbc1d)](https://app.codacy.com/gh/djav1985/v-serpbear/dashboard) ![License](https://img.shields.io/github/license/djav1985/v-serpbear) ![Version](https://img.shields.io/github/package-json/v/djav1985/v-serpbear) ![Docker pulls](https://img.shields.io/docker/pulls/vontainment/v-serpbear)

---

## Quick links

- 📘 **Documentation:** <https://docs.serpbear.com/>
- 📜 **Changelog:** [`CHANGELOG.md`](./CHANGELOG.md)
- 🐳 **Docker Hub image:** <https://hub.docker.com/r/vontainment/v-serpbear>
- 🛟 **Community support:** [GitHub Discussions](https://github.com/djav1985/v-serpbear/discussions)

---

## What is SerpBear?

SerpBear is a full-stack Next.js application that tracks where your pages rank on Google, enriches those rankings with Google Search Console and Google Ads data, and keeps stakeholders informed with scheduled email digests. The project ships as a production-ready Docker image, a conventional Node.js application, and a programmable REST API so you can integrate SERP intelligence wherever you need it.

### Core capabilities

- **Unlimited domains & keywords:** Organise an unrestricted number of tracked keywords across multiple sites.
- **Turn-key scraping integrations:** Connect a managed SERP data provider or bring your own proxy, then run high-volume organic rank checks with built-in retries.
- **Keyword research & ideas:** Pull search volumes and suggested keywords straight from your Google Ads test account.
- **Google Search Console enrichment:** Overlay verified impression and click data on keyword trends to see which rankings actually drive traffic.
- **Scheduled notifications:** Deliver branded summaries of ranking changes, winners/losers, and visit counts to your inbox.
- **Local map-pack tracking:** When supported scrapers return the top-three local pack, SerpBear stores the flag and displays a stacked "MAP" badge beneath each keyword's country flag in the dashboard and a compact "MP" badge in email digests. The badge now suppresses the legacy sprite background so you will not see stray punctuation behind the green label. The domains overview also surfaces a "Map Pack" counter in the tracker summary when your chosen scraper exposes this data.
- **Mobile-ready progressive web app:** Install the dashboard on iOS or Android for quick monitoring on the go. The layout keeps consistent gutters while the top navigation now stretches truly edge-to-edge on phones—the helper offsets the body gutter and widens the bar so no stray right-side padding returns.
- **Adaptive desktop canvas:** Domain dashboards, Search Console insights, and the research workspace reuse a shared `desktop-container` utility that expands to 90 % of the viewport on large screens so wide monitors surface more data at once.
- **Focused loading states:** Keyword tables drive their own loading indicators, so the single-domain and research workspaces stay visible while data refreshes, and only the domains index keeps the full-page bootstrap overlay when first loading.
- **Robust API:** Manage domains, keywords, settings, and refresh jobs programmatically for automated reporting pipelines.

### Platform architecture at a glance

- **Frontend & API:** Next.js 15 application serving React pages and JSON endpoints from a single codebase.
- **Database:** SQLite (via a custom `better-sqlite3` dialect) by default, with optional external database support through Sequelize.
- **Background workers:** Node-based cron runner schedules scrapes, retries, Google Search Console refreshes, and notification emails according to configurable cron expressions and timezone settings.
- **Integrations:** Pluggable scrapers, Google Search Console, Google Ads, and SMTP providers are all controlled via environment variables.

![Animated dashboard tour](https://serpbear.b-cdn.net/serpbear_readme_v2.gif "Animated dashboard tour")

> _If the animation above does not render, imagine a 15-second screen recording that walks through adding a domain, reviewing the keyword table, and exploring rank history charts. The UI mirrors what you will see after deploying the app._

---

## Getting started

> ℹ️ **Workspace layout:** All runtime Next.js code and npm scripts live in the `./app` directory. Shared test fixtures (`__tests__/`, `__mocks__/`) and developer dotfiles stay at the repository root. Run Node.js commands from `./app`.

### Option 1 – Docker Compose

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
cp .env.example .env
# edit .env (project root) with your credentials and scraping provider
docker compose up -d
```

The default compose stack persists the container's `/app/data` directory in a named volume so your SQLite database and cached Search Console exports survive updates.

### Option 2 – Node.js runtime

1. Install Node.js **18.18+** (the project ships an `.nvmrc` pinning `20.18.0`).
2. Change into the application workspace: `cd app`.
3. Install dependencies with `npm install` (or `npm ci`).
4. Copy the repository `.env.example` into the workspace (`cp ../.env.example .env.local`) and fill in the required keys.
5. **Apply database migrations:** `npm run db:migrate` to set up the SQLite database schema.
6. Start the development server via `npm run dev` or build and serve production assets with `npm run build && npm run start`.

### Database & migrations

- **SQLite files:** Live under `./app/data` by default; mount that directory when running inside containers to keep your historical data.
- **Docker deployments:** Database migrations run automatically from `entrypoint.sh` whenever the container starts. No manual intervention required.
- **Local Node.js development:** Use `npm run db:migrate` to apply schema changes manually (as shown in the setup steps above). Run `npm run db:revert` to roll back the most recent migration if needed.
- **Migration tooling:** The bundled Sequelize/Umzug tooling works for both approaches—Docker uses it internally, while local development exposes it through npm scripts.
- Keyword history rows now default to `{}`. The included migrations also backfill any legacy `'[]'` payloads so refresh jobs always receive plain objects.

---

## Configuration reference

All runtime behaviour is controlled through environment variables. The tables below summarise every supported option and note the defaults that ship with `.env.example`.

### Authentication & session management

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `USER` | `admin` | ✅ | Initial dashboard username. Update after first login. |
| `PASSWORD` | `0123456789` | ✅ | Initial dashboard password. Update after first login. |
| `SECRET` | random string | ✅ | Cryptographic secret for cookie signing and JWT verification. Generate a unique value per deployment. |
| `APIKEY` | random string | ✅ | Server-side API key used to authenticate REST requests from external clients. |
| `SESSION_DURATION` | `24` | ✅ | Session lifetime (hours). Controls how long login cookies remain valid. |

### Application runtime

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | ✅ | Public URL of your deployment. Determines callback URLs for integrations and absolute links in email digests. |
| `NEXT_PUBLIC_SCREENSHOTS` | `true` | ✅ | Toggle keyword thumbnail capture in the UI. Set to `false` to fall back to favicons. |
| `SCREENSHOT_API` | — | ✅ | API key from your screenshot provider (e.g., ScreenshotOne). Without it the app refuses to queue screenshot jobs and surfaces configuration errors. |

### Scraping providers & keyword gathering

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `SCRAPER_TYPE` | `scrapingrobot` | ✅ | Identifier of the active SERP provider (`scrapingrobot`, `scrapingant`, `serpapi`, `serply`, `spaceserp`, `searchapi`, `valueserp`, `serper`, `hasdata`, or `proxy`). |
| `SCRAPING_API` | — | ✅ for managed scrapers | API key or token required by the selected provider. Not needed when using the `proxy` option with self-managed IPs. |

### Google integrations

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `SEARCH_CONSOLE_CLIENT_EMAIL` | — | Optional | Service account email with access to the Search Console properties you want to track. |
| `SEARCH_CONSOLE_PRIVATE_KEY` | — | Optional | Corresponding private key (remember to keep newlines escaped in `.env` files). |
| `ADWORDS_CLIENT_ID` | — | Optional | Google Ads OAuth client ID used for keyword volume and idea imports. |
| `ADWORDS_CLIENT_SECRET` | — | Optional | Google Ads OAuth client secret. |
| `ADWORDS_DEVELOPER_TOKEN` | — | Optional | Google Ads developer token for API access. |
| `ADWORDS_ACCOUNT_ID` | — | Optional | Google Ads manager account ID used when fetching keyword data. |

### Email notifications

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `SMTP_SERVER` | — | Optional | SMTP host for transactional email. |
| `SMTP_PORT` | — | Optional | Port used when connecting to the SMTP host. |
| `SMTP_USERNAME` | — | Optional | Authentication username (if required by your provider). |
| `SMTP_PASSWORD` | — | Optional | Authentication password or app-specific token. |
| `NOTIFICATION_EMAIL_FROM` | — | Optional | Sender email address that appears in notification emails. |
| `NOTIFICATION_EMAIL_FROM_NAME` | `SerpBear` | Optional | Friendly sender name shown to recipients. |

SerpBear also accepts an optional **SMTP TLS certificate hostname** override from the Notification settings modal (or via the `smtp_tls_servername` field in the settings API). Whitespace and trailing dots are trimmed automatically before the value is passed to Nodemailer as the TLS `servername`, making it easier to work with proxies or shared SMTP endpoints whose certificates do not match the connection host.

### Cron scheduling

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `CRON_TIMEZONE` | `America/New_York` | ✅ | IANA timezone used for all scheduled jobs. |
| `CRON_MAIN_SCHEDULE` | `0 0 0 * * *` | ✅ | Cron expression for daily scraping and Search Console refresh runs. |
| `CRON_FAILED_SCHEDULE` | `0 0 */1 * * *` | ✅ | Cron expression that retries failed scrapes. |
| `CRON_EMAIL_SCHEDULE` | `0 0 6 * * *` | ✅ | Cron expression for the daily notification email digest. |

All cron expressions are normalised at runtime—quotes and stray whitespace are stripped automatically before scheduling jobs.

### Database, security, and diagnostics

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | `sqlite:./data/database.sqlite` | Optional | Override to connect to an external database supported by Sequelize. |
| `NODE_ENV` | — | Optional | Set to `production` in production deployments to enable framework optimisations. |
| `FORCE_HTTPS` | — | Optional | When `true`, HTTP requests are redirected to HTTPS. Useful behind TLS-terminating proxies. |
| `SECURE_COOKIES` | — | Optional | Forces cookies to use the `Secure` flag. Enable in HTTPS environments. |
| `LOG_LEVEL` | `info` | Optional | Controls server-side log verbosity (`error`, `warn`, `info`, `debug`). |
| `LOG_SUCCESS_EVENTS` | `true` | Optional | When set to `false`, suppresses INFO-level success logs for authentication and API middleware while leaving warnings/errors untouched. |
| `SENTRY_DSN` | — | Optional | Enable Sentry monitoring by supplying a DSN. |
| `NEXT_REMOVE_CONSOLE` | — | Optional | Strip non-error `console.*` statements from the production client bundle when set to `true`. |

---

## Supported SERP data providers

SerpBear integrates with several managed APIs in addition to a "bring your own proxy" option. The table below summarises their capabilities as implemented in the current codebase.

| Provider | Pricing snapshot* | Geo targeting | Map Pack coverage | Organic results per request | API key header |
| --- | --- | --- | --- | --- | --- |
| Scraping Robot (`scrapingrobot`) | Free tier (~5,000 req/mo) | Country-level (locale + language) | No – organic listings only | 100 | Query string `token`
| ScrapingAnt (`scrapingant`) | Pay-as-you-go | Country-level (select markets) | No – organic listings only | 100 | `x-api-key`
| SerpApi (`serpapi`) | Plans from $50/mo | City & state (`allowsCity: true`) | **Yes** – extracts local map pack | 100 | `X-API-Key`
| Serply (`serply`) | Plans from $49/mo | City & region (supported markets) | **Yes** – extracts local map pack | 100 | `X-Api-Key` + `X-Proxy-Location`
| SpaceSerp (`spaceserp`) | Lifetime + subscription plans | City-level | **Yes** – extracts local map pack | 100 | Query string `apiKey`
| SearchApi (`searchapi`) | Plans from $40/mo | City-level | **Yes** – extracts local map pack | 100 | `Authorization: Bearer`
| ValueSerp (`valueserp`) | Pay-as-you-go ($2.50 / 1K req) | City-level | **Yes** – extracts local map pack | 100 | Query string `api_key`
| Serper (`serper`) | Pay-as-you-go ($1 / 1K req) | Country + language | **Yes** – extracts local map pack | 100 | Query string `apiKey`
| HasData (`hasdata`) | Plans from $29/mo | City-level | **Yes** – extracts local map pack | 100 | `x-api-key`
| Custom proxy (`proxy`) | Bring your own | Google default locale | No – organic listings only | Up to 100 (HTML parsing) | None

\*Pricing details are indicative; confirm current pricing with each vendor before purchasing. All managed integrations authenticate with the headers or query parameters shown in the final column, exactly as implemented in the `/scrapers/services` directory.

---

## Feature deep dive

### Keyword tracking workflow

1. **Add a domain** – supply the host name you want to monitor.
2. **Create keywords** – capture the query, target country, optional state/city pair (stored as a single location string), and device type (desktop/mobile).
3. **Run scrapes** – the cron worker queries your configured provider for the top 100 organic results and stores rank positions.
4. **Analyse trends** – interactive charts and tables surface historical rank, average position, and day-over-day change.
5. **Share insights** – export keyword data via the API or send scheduled email summaries to stakeholders.

### Google Search Console insights

- Authenticate with a service account and SerpBear will enrich each keyword with impression, click, and CTR metrics.
- Cached data refreshes automatically once per `CRON_MAIN_SCHEDULE` cycle (respecting `CRON_TIMEZONE`) and can be refreshed manually from the settings view.
- The Discover tab now disables Search Console keywords that are already tracked and its "select all" checkbox ignores those rows, mirroring the Google Ads ideas workflow to prevent duplicate tracking.
- Search Console data is optional; when credentials are missing the UI gracefully hides related panels.
- When credentials are present, manual refreshes and scheduled digests now always run the Search Console pipeline instead of skipping requests when the domain payload is unexpectedly falsy.

### Google Ads keyword research

- Connect a Google Ads test account to unlock keyword suggestions and historical volume data right inside SerpBear.
- The app exposes the same functionality through its REST API, making it easy to integrate with reporting pipelines.
- Already-tracked keyword ideas now render as disabled for the active device so research flows stay deduplicated when you revisit Google Ads suggestions.
- When Google Ads cannot supply any ideas that match your filters, the API now responds with a 404 and the UI shows a warning toast instead of a success banner so you can adjust the request immediately.

### Loading states & accessibility

- The domains dashboard, single-domain workspace, and research area now share a full-viewport loader that blocks interaction until router state and React Query data have settled.
- Keyword, idea, and insight tables use a spinner-only placeholder with visually hidden labels so loading affordances stay consistent without repeating "Loading…" copy on screen.

### Notifications & reporting

- Email digests summarise rank gains/losses, highlight top movers, and include Search Console traffic data when available.
- Notification cadence is fully configurable through `CRON_EMAIL_SCHEDULE`. Disable SMTP variables to skip sending emails entirely.
- Trigger a manual run from the **Send Notifications Now** button in the Notification settings modal. Inline guidance and assistive-technology announcements walk through the prerequisites so teams can confirm SMTP credentials and email recipients immediately.
- `/api/notify` now reserves HTTP 401 strictly for authentication issues—misconfigured SMTP hosts return 400 and runtime delivery errors surface as 500 responses with descriptive messages for easier debugging.

---

## REST API overview

Every feature available in the UI is backed by authenticated API routes. Authenticate with the `APIKEY` value and interact with endpoints such as:

- `GET /api/domain` – list tracked domains and their configuration.
- `POST /api/keyword` – add keywords programmatically.
- `POST /api/refresh` – queue immediate re-scrapes for selected keywords.
- `GET /api/settings` – fetch the current scraper, cron, and notification settings.

Refer to the [official documentation](https://docs.serpbear.com/) for the complete endpoint catalogue and payload schemas.

---

## Development workflow

- **Node.js version:** Use `nvm use` to adopt the `20.18.1` runtime pinned in `.nvmrc`.
- **Install dependencies:** `npm install`
- **Code quality:**
  - `npm run lint` for ESLint (JavaScript/TypeScript).
  - `npm run lint:css` for Stylelint (global styles).
  - Follow the repository's no-trailing-commas rule for object and array literals so configuration changes pass linting.
  - ESLint now caps line length warnings at 200 characters and reports function complexity over 60 as a warning; prefix unused arguments or errors with `_` to silence the new TypeScript-aware unused-variable checks.
- **Testing:**
  - `npm test` executes the Jest test suite using the `@happy-dom/jest-environment` adapter.
  - `npm run test:ci` mirrors the CI environment.
  - `npm run test:cv -- --runInBand` generates serialised coverage when debugging.
- **Database scripts:** `npm run db:migrate` / `npm run db:revert`.
- **Production build:** `npm run build` followed by `npm run start`.
- **UI patterns:** Add new icons through the `ICON_RENDERERS` map in `components/common/Icon.tsx` and rely on the exported keyword filtering helpers when building new table views to keep predicates shared and complexity low.

---

## Troubleshooting & tips

- **Keyword rows stuck on the loading spinner:** The API and dashboard now normalise legacy `'0'`/`'false'` flags returned by SQLite/MySQL responses, so refreshed keywords flip their `updating` state back to `false` and the position column stops rendering spinners once scraping finishes. Trigger another keyword refresh after deploying to clear any previously stuck rows.
- **Missing screenshots:** If dashboard thumbnails show the fallback favicon, confirm `SCREENSHOT_API` is set and `NEXT_PUBLIC_SCREENSHOTS=true`.
- **Screenshot refresh skips:** Manual thumbnail updates now always hit the screenshot service with the stored host, so investigate provider logs if a toast reports a failure instead of assuming the button silently ignored the request.
- **Corrupted screenshot cache:** If thumbnail reloads stop responding after local `domainThumbs` storage is edited or damaged, the app now clears the cache automatically and fetches a fresh image the next time you open the modal.
- **Empty domain slugs:** The dashboard now always requests `/api/domain`, even for blank slugs, so the API returns descriptive validation errors instead of the client throwing immediately.
- **Domain scraping toggle not persisting:** The custom SQLite dialect now coerces boolean bindings to integers so `/api/domains` updates keep `scrape_enabled` and the legacy `notification` flag aligned.
- **Scraper misconfiguration:** 500-series API responses often include descriptive JSON (with a `details` field) – surface these logs when opening support tickets.
- **Redirected SERP links:** The scraper now normalises Google results that route through `/url`, `/interstitial`, or related wrappers, so stored ranks always point at the destination domain. If you capture new HTML fixtures, keep those redirect paths intact so tests continue exercising the normalisation logic.
- **Cron timing:** Adjust cron expressions and `CRON_TIMEZONE` to align with your reporting cadence; expressions are normalised automatically, so quoting them in `.env` files is safe.
- **Database errors after upgrades:** For local Node.js development, run `npm run db:migrate` to apply schema changes. Docker deployments handle this automatically. The app logs detailed SQL errors if migrations fail.
- **Image placeholders in this README:** GitHub caches external images aggressively. When an illustration fails to load, rely on the accompanying description—the UI in your deployment will match those visuals once assets are served locally.

---

## Contributing

We welcome community contributions! Please:

1. Fork and clone the repository.
2. Create focused commits with descriptive messages.
3. Add or update tests for any behavioural change.
4. Run `npm run lint` and `npm test` before opening a pull request.

Check [`AGENTS.md`](./AGENTS.md) for repository-wide contribution guidelines.

---

## License

SerpBear is distributed under the [MIT License](./LICENSE). Commercial support and custom integrations are available—open a discussion if you need help deploying the platform at scale.

