# SerpBear

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/7e7a0030c3f84c6fb56a3ce6273fbc1d)](https://app.codacy.com/gh/djav1985/v-serpbear/dashboard) ![License](https://img.shields.io/github/license/djav1985/v-serpbear) ![Version](https://img.shields.io/github/package-json/v/djav1985/v-serpbear) ![Docker pulls](https://img.shields.io/docker/pulls/vontainment/v-serpbear)

## What is SerpBear?

SerpBear is a full-stack Next.js application that tracks where your pages rank on Google, enriches those rankings with Google Search Console and Google Ads data, and keeps stakeholders informed with scheduled email digests. The project ships as a production-ready Docker image, a conventional Node.js application, a programmable REST API, and a read-only MCP server so AI assistants can query your rankings directly. Use whichever fits your pipeline.

> **Warning:** Not every scraper provider is validated on every release. Please report any issues with specific integrations in GitHub Discussions.

### ✨ Why v-serpbear outperforms upstream SerpBear

| # | Area | What changed |
| --- | --- | --- |
| 1 | **Bug fixes & patches** | Hardened scrapers survive DOM and API drift, patched dependency regressions, and keep long-running jobs stable under high request volumes. |
| 2 | **Configuration & flexibility** | Streamlined environment variables, CI-powered deployment workflows, and dynamic toggles for ValueSerp, SerpAPI, and other providers eliminate hardcoded defaults. |
| 3 | **Security & modernization** | Modern Node.js support, removal of deprecated libraries, and stricter sanitisation guard against warning-laden installs and insecure runtime behaviour. |
| 4 | **Error handling & observability** | Descriptive logs, layered retry logic, and adjustable debug levels make diagnosing scraper hiccups or API failures straightforward. |
| 5 | **Performance & caching** | Smarter SERP caching, batched keyword refreshes, and fewer redundant calls drive faster crawls while reducing API spend. |
| 6 | **Google Map Pack** | Marks keywords that show up in the map pack. |
| 7 | **White labeling** | Easy white-labeling. |
| 8 | **Per-domain scraping** | Set scrapers per domain, globally, or both. |
| 9 | **Transparent SERP result coverage** | The keyword details panel shows exactly which pages were scraped and which were skipped. Skipped page ranges appear as clearly labelled placeholder blocks between real results, and the "not found" badge reflects the number of results checked rather than always displaying "No Results". |
| 10 | **Dynamic scraping strategy** | A two-mode system controls how many pages are checked per keyword at the global and per-domain level. **Basic** (default) scrapes only the first page; **Custom** scrapes a fixed number of pages (1–10). This addresses Google's removal of `num=100` support, so keywords beyond position 10 are no longer always reported as "No Results". |
| 11 | **Resilient restarts** | Any keyword left in a stuck "updating" state by a crash or container restart mid-scrape is reset on the next startup, so the UI never shows permanently stuck loading spinners. |

---

## Quick links

- 📘 **Documentation:** <https://docs.serpbear.com/>
- 📜 **Changelog:** [`CHANGELOG.md`](./CHANGELOG.md)
- 🐳 **Docker Hub image:** <https://hub.docker.com/r/vontainment/v-serpbear>
- 🔌 **MCP server:** `https://<your-host>/api/mcp`, see [MCP server](#mcp-server)
- 🆕 **Current version:** v4.0.0 by [Vontainment](https://vontainment.com)
- 🛟 **Community support:** [GitHub Discussions](https://github.com/djav1985/v-serpbear/discussions)

---

## Core capabilities

| # | Capability | Details |
| --- | --- | --- |
| 1 | **Unlimited domains & keywords** | Organise an unrestricted number of tracked keywords across multiple sites. |
| 2 | **Turn-key scraping integrations** | Connect a managed SERP data provider and run high-volume organic rank checks with built-in retries. |
| 3 | **Failed scrape controls** | Retry all failed keyword scrapes immediately, or clear the failed retry queue from Settings. |
| 4 | **Keyword research & ideas** | Pull search volumes and suggested keywords straight from your Google Ads test account. |
| 5 | **Google Search Console enrichment** | Overlay verified impression and click data on keyword trends to see which rankings drive traffic. |
| 6 | **Scheduled notifications** | Deliver branded summaries of ranking changes, winners and losers, and visit counts to your inbox. Each digest opens with a tracker summary styled like the dashboard card: total tracked keywords, the rolling average position, and, when your scraper supports it, how many queries sit in the local map pack. Averages come from live keyword data. Persisted domain map-pack totals take priority, and keyword counts are used only when that stat is unavailable, so missing aggregates no longer drop either figure to zero. On small screens the tracker metrics align in columns, mirroring the desktop digest. |
| 7 | **Trusted domain stats** | Background jobs are the single source of truth for domain aggregates. Until they persist an average position or map-pack total, the API omits those fields rather than guessing from the latest keyword sample. |
| 8 | **Local map-pack tracking** | When a supported scraper returns the top-three local pack, SerpBear stores the flag and shows a stacked "MAP" badge under each keyword's country flag on the dashboard, plus a compact "MP" badge in email digests. The domains overview also shows a "Map Pack" counter when your scraper exposes this data. |
| 9 | **Mobile-ready progressive web app** | Install the dashboard on iOS or Android for monitoring on the go. The top navigation stretches edge to edge on phones. |
| 10 | **Adaptive desktop canvas** | Domain dashboards, Search Console insights, and the research workspace use a shared `desktop-container` utility that expands to 90% of the viewport on large screens. |
| 11 | **Focused loading states** | Keyword tables show their own loading indicators, so the single-domain and research workspaces stay visible while data refreshes. Only the domains index shows the full-page bootstrap overlay on first load. |
| 12 | **Robust API** | Manage domains, keywords, settings, and refresh jobs programmatically for automated reporting pipelines, or connect an MCP client to read rankings and Search Console data. |
| 13 | **Transparent SERP coverage in keyword details** | Search results are grouped into segments. Dashed "Page X: N results skipped" placeholders mark unchecked positions, an inline banner summarises scraped vs. skipped counts, and not-found keywords read "Not in First N" instead of a hardcoded 100. |

## Platform architecture at a glance

| Layer | Responsibility |
| --- | --- |
| **Frontend & API** | Next.js 16 application serving React pages, JSON endpoints and the MCP server (`/api/mcp`) from a single codebase. |
| **Database** | SQLite through a custom `better-sqlite3` dialect (`database/sqlite-dialect.js`). Sequelize and Umzug manage models and migrations. No other database engine is configurable. |
| **Background workers** | A Node-based cron runner schedules scrapes, retries, Google Search Console refreshes, and notification emails from configurable cron expressions and timezone settings. |
| **Refresh queue** | Per-domain locking ensures a domain is never refreshed twice at once. Configurable concurrency keeps multiple domains processing in parallel. |
| **Integrations** | Scraper selection, Google Ads credentials, and SMTP settings are managed in the Settings UI and persisted in `data/settings.json`. Search Console credentials can come from Settings or from the `SEARCH_CONSOLE_*` environment variables as a global fallback. |

![Animated dashboard tour](https://serpbear.b-cdn.net/serpbear_readme_v2.gif "Animated dashboard tour")
![New dashboard tour](./screenshot.jpg "New dashboard tour")

_If the animation above does not render, imagine a 15-second screen recording that walks through adding a domain, reviewing the keyword table, and exploring rank history charts. The UI mirrors what you will see after deploying the app._

---

## Getting started

### Option 1 – Docker Compose

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
cp .env.example .env
# edit .env with your credentials and scraping provider
docker compose up -d
```

The default compose stack uses a named Docker volume (`data`) mounted at `/app/data` so your SQLite database and cached Search Console exports persist between updates. Compose prefixes the volume with the project name, which is the folder name by default, so run `docker volume ls` to find it (for example `v-serpbear_data` when cloned into `v-serpbear`). To inspect or back up the data, use `docker volume inspect <volume>` or copy files out with `docker cp`. The app is served at http://localhost:3030 because compose maps host port 3030 to container port 3000.

### Option 2 – Node.js runtime

1. Install Node.js **24.22.1 or a later 24.x release**, matching the version pinned in [`.nvmrc`](./.nvmrc).
2. Install dependencies with `npm install` (or `npm ci`).
3. Copy `.env.example` to `.env.local` for local development (Docker Compose uses `.env`) and fill in the required keys.
4. **Apply database migrations** with `npm run db:migrate` to set up the SQLite schema.
5. Start the development server with `npm run dev`, or build and serve production assets with `npm run build && npm run start`.

**Note:** Node.js 20 and older are no longer supported. Node.js 20 is end-of-life, and its bundled Brotli decoder is affected by CVE-2026-111497. Core dependencies such as `better-sqlite3` and `happy-dom` require a modern Node.js runtime.

### Database & migrations

- **SQLite files** live under `./data` by default for local Node.js development. Docker deployments use a named volume (`data`) mapped to `/app/data`; no bind mount is required.
- **Docker deployments** run migrations automatically from `entrypoint.sh` whenever the container starts.
- **Local Node.js development** uses `npm run db:migrate`. Run `npm run db:revert` to roll back the most recent migration.
- **Migration tooling:** the bundled Sequelize/Umzug tooling serves both approaches. Docker uses it internally, and local development exposes it through npm scripts.
- Keyword history rows default to `{}`. The included migrations backfill legacy `'[]'` payloads so refresh jobs always receive plain objects.

---

## Supported SERP data providers

SerpBear integrates with several managed SERP APIs. The table summarises their capabilities as implemented in the current codebase.

| Provider | Working | Pricing snapshot* | Geo targeting | Map Pack coverage | Results coverage | API key header |
| --- | --- | --- | --- | --- | --- | --- |
| Serply (`serply`) | ✅ Working | Plans from $49/mo | City & region (supported markets) | **Yes**: extracts local map pack | Strategy-controlled (10 per page, up to 10 pages) | `X-Api-Key` + `X-Proxy-Location` |
| SerpApi (`serpapi`) | ✅ Working | Free 250/mo + plans from $75/mo | City-level | **Yes**: extracts local map pack | Strategy-controlled (10 per page via the `start` offset, up to 10 pages) | Query string `api_key` |
| SearchApi (`searchapi`) | ✅ Working | Plans from $40/mo | City-level | **Yes**: extracts local map pack | Strategy-controlled (10 per page via the `page` parameter, up to 10 pages) | Query string `api_key` |
| ValueSerp (`valueserp`) | ✅ Working | Pay-as-you-go 10,000 for $25 | City-level | **Yes**: extracts local map pack | Strategy-controlled (10 per page, up to 10 pages) | Query string `api_key` |
| Serper (`serper`) | ✅ Working | Credit-based 50,000 for $50 | City-level | Yes: from the `locations` block | Strategy-controlled (10 per page, up to 10 pages) | Query string `apiKey` |
| HasData (`hasdata`) | ✅ Working | Free 1,000/mo + plans from $49/mo | City-level | **Yes**: extracts local map pack | Strategy-controlled (10 per page, up to 10 pages) | Header `x-api-key` |
| CrazySERP (`crazyserp`) | ✅ Working | Pay-as-you-go | City-level | No: organic listings only | Strategy-controlled (10 per page, up to 10 pages) | Header `Authorization: Bearer` |
| PrismCrawl (`prismcrawl`) | ✅ Working | Free 100 credits on signup; one-time packages from $5 (e.g. $100 = 476,191 credits, ~$0.21 per 1,000); credits valid 90 days; no subscription | City-level | **Yes**: matches local results by business name | Strategy-controlled (10 per page, up to 10 pages) | Header `x-api-key` (POST JSON body) |
| DataForSEO (`dataforseo`) | ✅ Working | Pay as you go; no subscriptions; $50 minimum top-up | City-level | **Yes**: extracts `local_pack` results | Strategy-controlled (10 per page, up to 10 pages; each request fetches the depth needed for the page) | HTTP Basic auth with `login:password` in the API key field (POST JSON array body) |

\*Pricing is indicative. Confirm current pricing with each vendor before purchasing. Managed integrations authenticate with the headers or query parameters shown in the last column, as implemented in the `/scrapers/services` directory. ✅ = recently validated in production; ? = implemented but not recently validated against the live API.

> **Results coverage** reflects the scrape strategy in use (see [Scrape Strategy](#scrape-strategy) below).
>
> - Every provider returns 10 results per page.
> - The strategy controls how many pages are fetched per keyword refresh.

### Per-domain scraper overrides

Each domain can use its own scraping provider without changing the global default. Open **Domains**, click a domain, and switch to the **Scraper** tab in the settings modal. Pick a provider from the drop-down, or revert to **System Scraper**, then enter the API key in the masked input if the provider needs one. Stored keys are encrypted before they are saved, and the helper keeps the latest key for the same provider unless you clear it. Domains on **System Scraper** inherit the global configuration. Because overrides change the effective scraper per domain, they also decide whether a refresh job can run keywords in parallel. The pipeline checks each domain's final scraper settings before using the faster path.

#### Business Name (optional)

The **Business Name** field in the domain scraper configuration is optional. Map pack detection matches your business against local results by name only.

1. Each provider builds its own list of local results from its response, in the order Google shows them.
2. If one of the first three local results has a title equal to your business name, the keyword counts as a map pack appearance.
3. The comparison is case-insensitive and ignores leading and trailing spaces. Otherwise it requires an exact match.

**Use it when** your domain targets local queries, your scraper supports map pack detection (ValueSerp, SerpAPI, SearchAPI, HasData, Serply, PrismCrawl, or DataForSEO), and your Google Business Profile name follows a consistent format.

**Example:** if your domain is `vontainment.com` and your business name in Google My Business is "Vontainment", enter "Vontainment". When it appears as one of the first three local results, SerpBear records a map pack appearance. A local result's link is stored when the provider returns one, but it is not used for matching.

---

## Configuration reference

Runtime behaviour is controlled through environment variables and settings stored in `data/settings.json`. The tables below list the supported environment variables. Defaults mirror `.env.example` where it provides them.

**Env files.** Next.js loads `.env.local` for local development, and Docker Compose reads `.env`. The standalone cron worker (`tsx cron.js` / `npm run cron`) loads `.env.local` first and then `.env`, so keep local credentials in `.env.local` when running the worker outside Docker.

### Authentication & session management

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `USER` | — | Yes | Initial dashboard username. `.env.example` uses `admin`. Change it after first login. |
| `USER_NAME` | — | Optional | Username that takes precedence over `USER` when set. Used by the login check and the database username. |
| `PASSWORD` | — | Yes | Initial dashboard password. `.env.example` uses the placeholder `change-me`; set a real value. |
| `SECRET` | — | Yes | Cryptographic secret for cookie signing and JWT verification. Login reports a configuration error when it is unset. Generate a unique value per deployment. |
| `APIKEY` | — | Yes | Server-side API key that authenticates REST and MCP requests from external clients. Generate it with `openssl rand -hex 32`. |
| `SESSION_DURATION` | `24` | Optional | Session lifetime in hours. Controls how long login cookies stay valid. |
| `TRUST_PROXY` | `0` | Optional | Number of reverse proxies in front of the app. Login throttling and rate limits then use the `X-Forwarded-For` entry that many hops from the right. |

### Application runtime

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Yes | Public URL of your deployment. Sets OAuth callbacks and absolute links in email digests. Server-side code falls back to `APP_URL` when this is unset. |
| `APP_URL` | — | Optional | Server-side origin used when `NEXT_PUBLIC_APP_URL` is unset. Useful for CLI scripts that cannot inject the public variable. |
| `NEXT_PUBLIC_SCREENSHOTS` | `true` | Optional | Toggles keyword thumbnail capture (thum.io) in the UI. Set to `false` to show favicons instead. `SCREENSHOTS` is the preferred name and takes precedence when both are set. |
| `NEXT_PUBLIC_WHITE_LABEL` | `false` | Optional | Enables white-label branding. When `true`, the platform name and logo come from the variables below. |
| `WHITE_LABEL_LOGO_FILE` | `branding-logo.png` | Optional | File name under `/app/data` for the custom logo. A 96×96 px PNG, SVG, or WEBP works best. |
| `NEXT_PUBLIC_PLATFORM_NAME` | `SerpBear` | Optional | Display name for the app and notification emails in white-label mode. |

**Runtime branding.** The UI loads changes to `NEXT_PUBLIC_WHITE_LABEL`, `NEXT_PUBLIC_PLATFORM_NAME`, or your logo file on demand. Update the values or files and refresh the browser. No container rebuild is needed.

### Google integrations

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `SEARCH_CONSOLE_CLIENT_EMAIL` | — | Optional | Service account email with access to the Search Console properties you want to track. |
| `SEARCH_CONSOLE_PRIVATE_KEY` | — | Optional | Matching private key. Keep newlines escaped in `.env` files. |

Search Console credentials can also be set in the Settings UI, stored in `data/settings.json`. Those values take precedence over environment variables. Google Ads credentials are configured in Settings and stored encrypted in `data/settings.json`. The current codebase has no Google Ads environment variables.

### Email notifications

SMTP settings (server, port, credentials, sender, and TLS override) are configured in the Notification settings modal or through the settings API, and stored in `data/settings.json`. They are not read from environment variables. SerpBear trims whitespace and trailing dots from the optional SMTP TLS hostname (`smtp_tls_servername`) before passing it to Nodemailer.

### Settings stored in `data/settings.json`

Use the Settings UI or `/api/settings` to manage values persisted in `data/settings.json` and encrypted with `SECRET`.

| Area | Keys |
| --- | --- |
| Scraper | `scraper_type`, `scraping_api`, `scrape_interval`, `scrape_delay`, `scrape_retry`, `scrape_strategy`, `scrape_pagination_limit` |
| Notification defaults | `notification_interval`, `notification_email`, `notification_email_from`, `notification_email_from_name` |
| SMTP credentials | `smtp_server`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_tls_servername` |
| Google integrations | `search_console_client_email`, `search_console_private_key`, and the `adwords_*` credentials used for keyword ideas |
| UI preferences | `keywordsColumns` |

### Cron scheduling

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `CRON_TIMEZONE` | `America/New_York` | Optional | IANA timezone used for all scheduled jobs. |
| `CRON_MAIN_SCHEDULE` | `0 0 0 * * *` | Optional | Cron expression for daily scraping and Search Console refresh runs. |
| `CRON_FAILED_SCHEDULE` | `0 0 */1 * * *` | Optional | Cron expression that retries failed scrapes. |
| `CRON_EMAIL_SCHEDULE` | `0 0 6 * * *` | Optional | Cron expression for the daily notification email digest. |

All cron expressions are normalised at runtime. Quotes and stray whitespace are stripped before jobs are scheduled.

The Scraper setting `scrape_interval` selects the schedule used for keyword scrapes (default `daily`). The notification setting `notification_interval` (`daily`, `weekly`, `monthly`, or `never`) selects how often digests go out. Digests are sent at the time set by `CRON_EMAIL_SCHEDULE`.

### Monitoring & logging

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | `info` | Optional | Log verbosity for the structured logger. Accepts `error`, `warn`, `info`, `debug`. Set to `off`, `none`, `false`, or `0` to disable logging. |
| `LOG_SUCCESS_EVENTS` | — | Optional | Reserved for future use. Ignored in the current codebase. |
| `NEXT_REMOVE_CONSOLE` | — | Optional | Not wired in `next.config.js`. Currently has no effect. |
| `REFRESH_QUEUE_CONCURRENCY` | `3` | Optional | Maximum number of domains refreshed in parallel. The queue still prevents duplicate refreshes for the same domain. |
| `PARALLEL_SCRAPE_CONCURRENCY` | `3` | Optional | Maximum simultaneous keyword scrapes per domain for sequential scraper providers. SerpApi and SearchApi keep their existing parallel behaviour. |
| `PARALLEL_REFRESH_CONCURRENCY` | `10` | Optional | Maximum number of keywords scraped in parallel within a single refresh run. Must be a positive integer. |

---

## Feature deep dive

### Keyword tracking workflow

1. **Add a domain.** Supply the host name you want to monitor.
2. **Create keywords.** Capture the query, target country, optional state/city pair (stored as one location string), and device type (desktop or mobile).
3. **Run scrapes.** The cron worker queries your provider and stores rank positions. The active [scrape strategy](#scrape-strategy) sets how many result pages are checked per keyword.
4. **Analyse trends.** Interactive charts and tables show historical rank, average position, and day-over-day change.
5. **Share insights.** Export keyword data through the API, or send scheduled email summaries to stakeholders.

### Keyword details panel & SERP coverage

Click any keyword row to open the details panel. It shows the full SERP snapshot alongside rank-history charts. When a strategy skips pages, for example with providers that return only first-page results, the panel shows the gaps:

- **Skipped-page placeholders.** Consecutive skipped positions collapse into dashed blocks labelled `Page X: N results skipped`, placed between real result cards at the correct position.
- **Coverage summary banner.** When positions were skipped, a blue banner at the top of the results shows `X results scraped • Y positions skipped (scrape strategy limits pages checked)`.
- **Adaptive "not found" badge.** If your domain was not found and positions were skipped, the header badge reads `Not in First N`, where N is the number actually scraped, instead of `No Results`.
- **Accurate highlight.** The amber highlight on your tracked domain matches by position value rather than list index, so it works even when the result set is non-contiguous.

### Scrape Strategy

Google's removal of `num=100` support limits most SERP APIs to 10 results per request. The Scrape Strategy controls how many pages (up to 10 results each) are fetched per keyword on every refresh. That lets you trade API credit spend against ranking depth.

| Strategy | Behaviour | API credits per keyword |
| --- | --- | --- |
| **Basic** (default) | Fetches only the first page, positions 1–10. Fastest and cheapest. | 1 request |
| **Custom** | Fetches a fixed number of pages you choose (1–10). Useful when rankings are stable in a known range. | 1–10 requests |

**Failed pages:** If a page request fails and the domain was not found on the pages that loaded, the keyword is reported as an error with the provider's message. It keeps its previous position and history rather than being recorded as "not ranked".

#### Configuring the strategy

- **Globally:** open **Settings → Scraper** and use the _Scrape Strategy_ drop-down. Choosing **Custom** shows a page-count selector (1–10).
- **Per domain:** open a domain, switch to the **Scraper** tab, and choose a _Scrape Strategy Override_. Any value other than **Use Global Setting** enables the domain-level controls.

#### How results are stored

Fetched positions carry real SERP data. Positions on pages that were not scraped are stored with a `skipped` flag. The details panel draws those ranges as dashed placeholders, and the "not found" badge shows `Not in First N`.

### Keyword research & Google Ads

- Connect a Google Ads test account to get keyword suggestions and historical volume data inside SerpBear.
- The same functionality is exposed through the REST API, so it fits into reporting pipelines.
- Already-tracked ideas show as disabled for the active device, which keeps research flows free of duplicates.
- When Google Ads returns no ideas that match your filters, the API responds with 404 and the UI shows a warning toast, so you can adjust the request right away.
- Email selected ideas from the research table or a domain's ideas tab. The research view asks you to pick a destination domain first. Domain idea pages use their notification contacts. The message includes a table of monthly searches, trend history, and competition, and does not count against the scheduled notification throttle.

### Google Search Console insights

- Authenticate with a service account, and SerpBear adds impression, click, and CTR metrics to each keyword.
- Cached data refreshes once per `CRON_MAIN_SCHEDULE` cycle, scheduled in `CRON_TIMEZONE`. The Search Console date window is fixed to `America/Los_Angeles` (`SEARCH_CONSOLE_TIMEZONE` in `utils/timezone.ts`). You can also refresh it manually from the settings view.
- The Discover tab disables Search Console keywords that are already tracked. Its "select all" checkbox skips those rows, matching the Google Ads ideas workflow.
- Search Console is optional. Without credentials, the related panels stay hidden.
- With credentials present, manual refreshes and scheduled digests always run the Search Console pipeline.

### Notifications & reporting

- Email digests summarise rank gains and losses, highlight top movers, and include Search Console traffic when available.
- Frequency (daily, weekly, monthly, or never) is set by the notification interval in Settings. The send time comes from `CRON_EMAIL_SCHEDULE`. Clear the SMTP values in Settings to stop emails entirely.
- Send a manual digest with **Send Notifications Now** in the Notification settings modal. Inline guidance walks through the prerequisites, so you can confirm SMTP credentials and recipients.
- `/api/notify` returns HTTP 401 only for authentication problems. Misconfigured SMTP hosts return 400, and delivery errors return 500 with a descriptive message.

### Loading states & accessibility

- The domains dashboard, single-domain workspace, and research area share a full-viewport loader that blocks interaction until router state and React Query data settle.
- Keyword, idea, and insight tables use a spinner-only placeholder with visually hidden labels, so loading stays consistent without on-screen "Loading…" text.

---

## External API

These endpoints can be called by other programs. Send the header `Authorization: Bearer <APIKEY>`, where `APIKEY` is the value set in your environment. The same key authenticates the [MCP server](#mcp-server). Every other route needs a logged-in session. Every `domain` field is a real domain name such as `example.com` (not a URL slug).

| Method | Endpoint | Fields it takes | What it does |
|---|---|---|---|
| GET | `/api/keyword` | Query `id` (one keyword ID, required) | Returns the stored data and position history of one keyword. |
| GET | `/api/keywords` | Query `domain` (required) | Lists all tracked keywords of a domain. |
| GET | `/api/domains` | Query `withstats` (optional, `true` adds keyword statistics) | Lists all tracked domains. |
| POST | `/api/refresh` | Body `ids` (array of keyword IDs), or query `id` (comma-separated IDs, or `all` together with query `domain`) | Starts a position refresh for the chosen keywords. |
| POST | `/api/cron` | None | Starts a background position refresh for every domain with scraping enabled, the same job the scheduled cron runs. Returns 400 if no scraper is set up. |
| POST | `/api/notify` | Query `domain` (optional) | Sends the notification email for one domain, or for every domain when `domain` is left out. |
| GET | `/api/searchconsole` | Query `domain` (required) | Returns the Google Search Console data of a domain (fetched again if older than 24 hours). |
| POST | `/api/searchconsole` | None | Refreshes the Search Console data of all domains. |
| GET | `/api/insight` | Query `domain` (required) | Returns Search Console insight (top pages, keywords, countries, stats) for a domain. |
| GET | `/api/ideas` | Query `domain` (optional; leave it out for the research page) | Returns the saved keyword ideas and favourites. |
| POST | `/api/ideas` | Body `domain` (optional; leave it out for research), `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `keywords` (up to 1000 strings), `country` (two letters), `language` (Google Ads language ID), `seedSCKeywords`, `seedCurrentKeywords` | Fetches new keyword ideas from Google Ads and saves them. `seedType: auto` needs a `domain`. |

Examples:

```bash
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3000/api/keywords?domain=example.com"
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3000/api/insight?domain=my-site.com"
```

A `domain` that is not a valid domain name returns 400, and an unknown one returns 404 where the endpoint looks the domain up.

### Success responses (2xx)

Successful responses return the resource data directly in the body and include an `X-Request-Id` header for request correlation.

```json
// GET /api/domains - 200 OK
{
  "domains": [ /* DomainType[] */ ]
}
```

### Failure responses (4xx / 5xx)

Error responses always use this envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Domain not found",
    "details": "optional extra context"
  },
  "requestId": "1748901234567-abc123xyz"
}
```

| Field | Type | Description |
|---|---|---|
| `error.code` | `string` | Machine-readable code, such as `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`, `METHOD_NOT_ALLOWED`, `INTERNAL_SERVER_ERROR` |
| `error.message` | `string` | Human-readable description of the error |
| `error.details` | `unknown` (optional) | Extra context, such as validation error lists |
| `requestId` | `string` (optional) | Matches the `X-Request-Id` header for log correlation |

### MCP server

SerpBear also serves a read-only [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp`, using the Streamable HTTP transport in stateless mode. Any MCP client that accepts a remote server URL with a header can connect.

- **URL:** `https://<your-host>/api/mcp`. Serve it over HTTPS (for example behind a reverse proxy), because the key is sent on every request.
- **Header:** `Authorization: Bearer <APIKEY>`
- **Requests:** `POST` only. `GET` and other methods return 405.

The server exposes six tools, all reading data:

| Tool | What it returns |
|---|---|
| `get_keyword` | One keyword by `id`, with its position history |
| `list_keywords` | All tracked keywords of a `domain` |
| `list_domains` | All tracked domains, optionally with `withstats` |
| `get_searchconsole` | Raw Search Console rows for a `domain` (3, 7 and 30 days) |
| `get_insight` | Summary of top pages, keywords and countries for a `domain` |
| `get_keyword_ideas` | Saved keyword ideas and favourites for a `domain`, or the research list when `domain` is omitted |

Domain fields take real domain names such as `example.com`. Tools that start scrapes, send email or spend Google Ads quota are not exposed through MCP; use the REST endpoints in [External API](#external-api) for those.

---

## Development workflow

- **Node.js version:** run `nvm use` to adopt the runtime pinned in `.nvmrc`.
- **Install:** `npm install`
- **Lint:**
  - `npm run lint` runs ESLint for JavaScript and TypeScript.
  - `npm run lint:css` runs Stylelint for global styles. The config registers `@stylistic/stylelint-plugin`, so use `npx stylelint "**/*.{css,scss}"` to lint component styles or check indentation fixes.
  - Follow the no-trailing-commas rule for object and array literals so config changes pass lint.
  - ESLint warns above 200 characters per line and warns on function complexity above 60. Prefix unused arguments or errors with `_` to satisfy the TypeScript-aware unused-variable checks.
- **Testing:**
  - `npm test` runs Jest with the `@happy-dom/jest-environment` adapter.
  - `npm run test:ci` mirrors the CI environment.
  - `npm run test:cv -- --runInBand` produces serialised coverage for debugging.
  - Regression specs assert the camelCase `mapPackTop3` flag. Keep it in fixtures when you add cases.
- **Database scripts:** `npm run db:migrate` and `npm run db:revert`
- **Production build:** `npm run build`, then `npm run start`
- **Full stack (web + cron):** `npm run start:all` runs the Next.js server and the cron worker in one terminal through `concurrently`.
- **UI patterns:** add icons through the `ICON_RENDERERS` map in `components/common/Icon.tsx`. Use the exported keyword filtering helpers when you build table views, which keeps predicates shared and complexity low.
- **Dropdowns:** `SelectField` respects its `minWidth` prop (default 180).
- **Settings callouts:** Google Ads and Search Console settings show the latest `settingsError` above the form.

---

## Contributing

1. Fork and clone the repository.
2. Make focused commits with descriptive messages.
3. Add or update tests for any behavioural change.
4. Run `npm run lint` and `npm test` before opening a pull request.

See [`AGENTS.md`](./AGENTS.md) for repository-wide guidelines.

---

## License

SerpBear is distributed under the [MIT License](./LICENSE). Commercial support and custom integrations are available. Open a discussion if you need help deploying the platform at scale.
