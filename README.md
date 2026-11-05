# SerpBear

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/7e7a0030c3f84c6fb56a3ce6273fbc1d)](https://app.codacy.com/gh/djav1985/v-serpbear/dashboard) ![License](https://img.shields.io/github/license/djav1985/v-serpbear) ![Version](https://img.shields.io/github/package-json/v/djav1985/v-serpbear) ![Docker pulls](https://img.shields.io/docker/pulls/vontainment/v-serpbear)

SerpBear is a full-stack Next.js application that tracks where your pages rank on Google, adds Google Search Console and Google Ads data to those rankings, and sends scheduled email digests. It ships as a Docker image or a plain Node.js app, and offers a REST API and a read-only MCP server so scripts and AI assistants can read your rankings.

> **Warning:** Not every scraper provider is validated on every release. Report problems with a specific provider in [GitHub Discussions](https://github.com/djav1985/v-serpbear/discussions).

![Animated dashboard tour](https://serpbear.b-cdn.net/serpbear_readme_v2.gif "Animated dashboard tour")
![Dashboard screenshot](./screenshot.jpg "Dashboard screenshot")

## Contents

- [Quick links](#quick-links)
- [Features](#features)
- [Getting started](#getting-started)
- [Supported SERP data providers](#supported-serp-data-providers)
- [Configuration reference](#configuration-reference)
- [Feature deep dive](#feature-deep-dive)
- [External API](#external-api)
- [MCP server](#mcp-server)
- [Development workflow](#development-workflow)
- [Contributing](#contributing)
- [License](#license)

## Quick links

- 📘 **Documentation:** <https://docs.serpbear.com/>
- 📜 **Changelog:** [`CHANGELOG.md`](./CHANGELOG.md)
- 🐳 **Docker Hub image:** <https://hub.docker.com/r/vontainment/v-serpbear>
- 🛟 **Community support:** [GitHub Discussions](https://github.com/djav1985/v-serpbear/discussions)
- Made by [Vontainment](https://vontainment.com)

---

## Features

**What this fork adds over upstream SerpBear**

- **Map pack tracking.** Flags keywords where your business is in the local top three, and highlights your listing in the keyword details.
- **Scrape strategy.** Choose how many result pages (1–10) are checked per keyword, globally or per domain. This works around Google dropping `num=100`.
- **Per-domain scrapers.** Give each domain its own provider and API key, or use one global scraper.
- **Transparent coverage.** The keyword details panel shows which pages were scraped and which were skipped.
- **Google redirect resolving.** Optional [Serper](https://serper.dev) lookup turns `google.com/goto` result links into real URLs.
- **White labelling.** Custom name and logo, applied at runtime without a rebuild.
- **MCP server.** Read-only access to rankings, Search Console and ideas for AI assistants.
- **Hardening and stability.** Current Node.js, encrypted stored keys, login and API-key throttling, layered retries, and keywords stuck in "updating" after a crash are reset on the next startup.

**Core capabilities**

| Capability | Details |
| --- | --- |
| **Unlimited domains and keywords** | Track as many keywords as you like across multiple sites, per country, city and device. |
| **Managed SERP providers** | Nine providers with built-in retries (see [Supported SERP data providers](#supported-serp-data-providers)). |
| **Failed scrape controls** | Retry all failed scrapes immediately, or clear the retry queue from Settings. |
| **Keyword research** | Search volumes and suggestions from a Google Ads test account. |
| **Search Console enrichment** | Impressions, clicks and CTR next to your rankings. |
| **Email digests** | Branded summaries of winners, losers and visits, opening with a tracker summary (tracked keywords, average position, map pack count). |
| **Reliable domain stats** | Background jobs are the source of truth for domain averages and map pack totals. The API omits these fields until the jobs have saved them. |
| **Progressive web app** | Install the dashboard on iOS or Android. |
| **API and MCP** | Manage and read data programmatically. |

**Architecture**

| Layer | Responsibility |
| --- | --- |
| **Frontend and API** | Next.js 16 serving React pages, JSON endpoints and the MCP server from one codebase. |
| **Database** | SQLite through a custom `better-sqlite3` dialect (`database/sqlite-dialect.js`), with Sequelize and Umzug for models and migrations. No other engine is supported. |
| **Background workers** | A Node cron runner schedules scrapes, retries, Search Console refreshes and digests from cron expressions and a timezone setting. |
| **Refresh queue** | Per-domain locking prevents two refreshes of one domain at once, with configurable concurrency across domains. |
| **Settings** | Scraper, SMTP and Google Ads credentials live in the Settings UI and are stored in `data/settings.json` (secrets encrypted with `SECRET`). |

---

## Getting started

### Option 1 – Docker Compose

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
cp .env.example .env
# edit .env: set USER, PASSWORD, SECRET, APIKEY and NEXT_PUBLIC_APP_URL
docker compose up -d
```

The app is served at <http://localhost:3030> (compose maps host port 3030 to container port 3000). Sign in with `USER` and `PASSWORD`, add a domain, then open **Settings → Scraper** to choose a provider and enter its API key.

Compose stores data in a named volume (`data`) mounted at `/app/data`, which holds the SQLite database, `settings.json` and cached Search Console exports. The volume name is prefixed with the project name (for example `v-serpbear_data`); find it with `docker volume ls`. Back it up with `docker volume inspect <volume>` or `docker cp`.

### Option 2 – Node.js

1. Install Node.js **24.22.1 or a later 24.x release** (pinned in [`.nvmrc`](./.nvmrc)). Node.js 20 and older are not supported: Node.js 20 is end-of-life and its bundled Brotli decoder is affected by CVE-2026-111497.
2. Run `npm install` (or `npm ci`).
3. Copy `.env.example` to `.env.local` and fill in the required keys.
4. Run `npm run db:migrate` to create the SQLite schema.
5. Start with `npm run dev`, or `npm run build && npm run start` for production. The cron worker is a separate process: run `npm run cron`, or use `npm run start:all` to run both together.

### Database and migrations

- SQLite files live in `./data` for Node.js, or in the `/app/data` volume for Docker.
- Docker runs migrations from `entrypoint.sh` at every container start.
- For Node.js, run `npm run db:migrate`, and `npm run db:revert` to undo the latest migration.
- Keyword history rows default to `{}`; the migrations backfill legacy `'[]'` values.

### Updating

Back up `data/` first. With Docker, run `docker compose pull && docker compose up -d` and migrations apply on start. With Node.js, pull, run `npm install`, `npm run db:migrate`, then rebuild. Read the *Upgrade notes* in the [changelog](./CHANGELOG.md) before upgrading.

---

## Supported SERP data providers

| Provider | Pricing snapshot* | Geo targeting | Map pack | Authentication |
| --- | --- | --- | --- | --- |
| Serply (`serply`) | Plans from $49/mo | City and region (supported markets) | Yes | Headers `X-Api-Key` and `X-Proxy-Location` |
| SerpApi (`serpapi`) | Free 250/mo, plans from $75/mo | City | Yes | Query `api_key` |
| SearchApi (`searchapi`) | Plans from $40/mo | City | Yes | Query `api_key` |
| ValueSerp (`valueserp`) | Pay-as-you-go, 10,000 for $25 | City | Yes | Query `api_key` |
| Serper (`serper`) | Credit-based, 50,000 for $50 | City | Yes (`locations` block) | Query `apiKey` |
| HasData (`hasdata`) | Free 1,000/mo, plans from $49/mo | City | Yes | Header `x-api-key` |
| CrazySERP (`crazyserp`) | Pay-as-you-go | City | Yes (`locations` block) | Header `Authorization: Bearer` |
| PrismCrawl (`prismcrawl`) | 100 free credits, packages from $5 (about $0.21 per 1,000, valid 90 days) | City | Yes | Header `x-api-key` (POST JSON) |
| DataForSEO (`dataforseo`) | Pay-as-you-go, $50 minimum top-up | City | Yes (`local_pack`) | HTTP Basic, `login:password` in the API key field |

\*Pricing is indicative. Check each vendor before buying. The request formats are implemented in [`scrapers/services`](./scrapers/services).

Every provider returns 10 results per page; the [scrape strategy](#scrape-strategy) sets how many pages are fetched.

### Per-domain scraper overrides

A domain can use its own provider without changing the global default. Open **Domains**, click a domain, and switch to the **Scraper** tab. Pick a provider (or **System Scraper** to inherit the global one) and enter the API key. Stored keys are encrypted. Per-domain settings also decide whether a refresh can run keywords in parallel, because the pipeline checks each domain's final scraper before using the faster path.

### Business name and map pack detection

The optional **Business Name** field in the domain scraper tab turns on map pack detection. Matching uses the name only, never the link.

1. Each provider builds a list of local results from its response, in the order Google shows them.
2. If one of the first three titles equals your business name, the keyword counts as a map pack appearance.
3. Comparison ignores case, spacing, punctuation and `&` versus `and` (so `Smith & Sons, Inc.` matches `smith and sons inc`). Anything else must match exactly.

Only the first results page is checked. In the keyword details, **Local Search Results** shows your listing in green and every other business in yellow, and the matching organic result is highlighted green. Local results saved before the flag existed show yellow until the keyword is refreshed.

**Example:** for `vontainment.com`, enter "Vontainment" if that is your Google Business Profile name.

---

## Configuration reference

Behaviour is controlled by environment variables and by settings stored in `data/settings.json`. `.env.example` lists the defaults.

**Env files.** Next.js reads `.env.local` for local development and Docker Compose reads `.env`. The standalone cron worker (`npm run cron`) loads `.env.local` first, then `.env`.

### Authentication and session

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `USER` | — | Yes | Dashboard username. `.env.example` uses `admin`. |
| `USER_NAME` | — | No | Takes precedence over `USER` when set. |
| `PASSWORD` | — | Yes | Dashboard password. Replace the `change-me` placeholder. |
| `SECRET` | — | Yes | Signs cookies and JWTs and encrypts stored keys. Login fails with a configuration error when unset. Use a unique value per deployment (`openssl rand -hex 32`). |
| `APIKEY` | — | Yes | Key for REST and MCP clients (`openssl rand -hex 32`). |
| `SESSION_DURATION` | `24` | No | Session lifetime in hours. |
| `TRUST_PROXY` | `0` | No | Number of reverse proxies in front of the app. Login throttling and rate limits then take the `X-Forwarded-For` entry that many hops from the right. |

### Application runtime

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Yes | Public URL, used for OAuth callbacks and links in emails. |
| `APP_URL` | — | No | Server-side origin. The cron worker uses it for its own calls to the app when set, which helps in Docker when the public URL is not reachable from inside the container. It is also the fallback when `NEXT_PUBLIC_APP_URL` is unset. |
| `NEXT_PUBLIC_SCREENSHOTS` | `true` | No | Keyword thumbnails via thum.io. `false` shows favicons. `SCREENSHOTS` takes precedence when both are set. |
| `NEXT_PUBLIC_WHITE_LABEL` | `false` | No | Enables white-label branding. |
| `WHITE_LABEL_LOGO_FILE` | `branding-logo.png` | No | Logo file name in `/app/data`. A 96×96 px PNG, SVG or WEBP works best. |
| `NEXT_PUBLIC_PLATFORM_NAME` | `SerpBear` | No | App and email name in white-label mode. |

Branding changes are read at request time: edit the values or logo, refresh the browser, no rebuild.

### Google integrations

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `SEARCH_CONSOLE_CLIENT_EMAIL` | — | No | Service account email with access to your Search Console properties. |
| `SEARCH_CONSOLE_PRIVATE_KEY` | — | No | Matching private key; keep newlines escaped in `.env` files. |

Search Console credentials can instead be saved in Settings, and those take precedence over the environment. Google Ads credentials are configured only in Settings (stored encrypted); there are no Google Ads environment variables.

### Email notifications

SMTP settings (server, port, credentials, sender, TLS override) are set in the Notification settings modal or via the settings API, and are not read from environment variables. The optional `smtp_tls_servername` is trimmed of whitespace and trailing dots before it reaches Nodemailer.

### Settings stored in `data/settings.json`

Manage these in the Settings UI or at `/api/settings`.

| Area | Keys |
| --- | --- |
| Scraper | `scraper_type`, `scraping_api`, `scrape_interval`, `scrape_delay`, `scrape_retry`, `scrape_strategy`, `scrape_pagination_limit` |
| Notification defaults | `notification_interval`, `notification_email`, `notification_email_from`, `notification_email_from_name` |
| SMTP | `smtp_server`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_tls_servername` |
| Google | `search_console_client_email`, `search_console_private_key`, and the `adwords_*` credentials for keyword ideas |
| UI | `keywordsColumns` |

### Cron scheduling

| Variable | Default | Description |
| --- | --- | --- |
| `CRON_TIMEZONE` | `America/New_York` | IANA timezone for scheduled jobs, for "today" in results and emails, and for history date keys. An unknown name falls back to the default. Changing it later does not re-key existing history. |
| `CRON_MAIN_SCHEDULE` | `0 0 0 * * *` | Daily scraping and Search Console refresh. |
| `CRON_FAILED_SCHEDULE` | `0 0 */1 * * *` | Retry of failed scrapes. |
| `CRON_EMAIL_SCHEDULE` | `0 0 6 * * *` | Time of the notification digest. |

Expressions are normalised at runtime (quotes and stray whitespace are stripped). The setting `scrape_interval` picks how often keywords are scraped (default `daily`), and `notification_interval` (`daily`, `weekly`, `monthly`, `never`) picks how often digests go out, at the `CRON_EMAIL_SCHEDULE` time.

### Performance, integrations and logging

| Variable | Default | Description |
| --- | --- | --- |
| `REFRESH_QUEUE_CONCURRENCY` | `3` | Domains refreshed in parallel. A domain is never refreshed twice at once. |
| `PARALLEL_REFRESH_CONCURRENCY` | `10` | Keywords scraped in parallel within one refresh run. Positive integer. |
| `PARALLEL_SCRAPE_CONCURRENCY` | `3` | Simultaneous keyword scrapes per domain for sequential providers. SerpApi and SearchApi keep their own parallel behaviour. |
| `SERPER_API_KEY` | empty | Free [Serper](https://serper.dev) key. When set, organic results that are `google.com/goto` links are turned into real URLs through Serper's `/resolve` endpoint, one lookup per link with no retries. This can add up to a minute to a scrape. Failures are logged as warnings and leave the link unchanged. Without a key, those links stay as they are. |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` or `debug`. `off`, `none`, `false` or `0` disables logging. Logs are JSON on stdout, so use `docker logs -f <container>`. |

---

## Feature deep dive

### Keyword tracking workflow

1. **Add a domain** with the host name to monitor.
2. **Add keywords** with the query, country, optional state and city, and device (desktop or mobile).
3. **Scrape.** The cron worker queries your provider and stores positions, using the [scrape strategy](#scrape-strategy).
4. **Analyse.** Charts and tables show history, average position and day-over-day change.
5. **Share.** Use the API or MCP server, or send email digests.

### Keyword details panel

Click a keyword row for the full SERP snapshot, the rank-history chart and the local results.

- **Local Search Results.** Your business in green, others in yellow (see [Business name](#business-name-and-map-pack-detection)).
- **Google Search Result.** Your result is highlighted green, matched by position value so non-contiguous result sets still work.
- **Skipped pages.** Unchecked positions appear as dashed `Page X: N results skipped` blocks between real results, with a banner showing scraped versus skipped counts.
- **Not found.** The badge reads `Not in First N` (N = results actually scraped) instead of a fixed 100, or `No Results` when nothing was scraped.
- **Map pack badge.** A "MAP" badge under the country flag in the dashboard and details, and "MP" in email digests. The domains overview shows a Map Pack counter.

### Scrape strategy

Google's removal of `num=100` limits SERP APIs to 10 results per request. The strategy sets how many pages are fetched per keyword, trading API credits against depth.

| Strategy | Behaviour | Requests per keyword |
| --- | --- | --- |
| **Basic** (default) | First page only, positions 1–10. | 1 |
| **Custom** | A fixed number of pages (1–10). | 1–10 |

- **Globally:** **Settings → Scraper → Scrape Strategy**. Choosing Custom shows a page-count selector.
- **Per domain:** the domain's **Scraper** tab, **Scrape Strategy Override** (any value but **Use Global Setting** enables the domain controls).
- **Storage:** positions on unscraped pages are stored with a `skipped` flag, which the details panel draws as placeholders.
- **Failed pages:** if a page request fails and the domain was not found on the pages that loaded, the keyword is reported as an error with the provider's message and keeps its previous position and history, rather than being recorded as "not ranked".

### Keyword research and Google Ads

- Connect a Google Ads test account for suggestions and historical volumes, also available through the REST API.
- Already-tracked ideas are disabled for the active device.
- When no ideas match, the API responds 404 and the UI shows a warning toast.
- Email selected ideas from the research table or a domain's ideas tab. The research view asks for a destination domain first; domain pages use their notification contacts. These emails do not count against the digest throttle.

### Google Search Console insights

- Authenticate with a service account to add impressions, clicks and CTR to each keyword.
- Cached data refreshes once per `CRON_MAIN_SCHEDULE` cycle, or manually from Settings. The Search Console date window is fixed to `America/Los_Angeles`.
- The Discover tab disables keywords that are already tracked, and "select all" skips them.
- It is optional. Without credentials the related panels stay hidden.

### Notifications and reporting

- Digests summarise gains and losses, top movers and, when available, Search Console traffic.
- Frequency comes from the notification interval and send time from `CRON_EMAIL_SCHEDULE`. Clear the SMTP settings to stop emails entirely.
- **Send Notifications Now** in the Notification modal sends a manual digest and shows what is needed (SMTP credentials, recipients).
- `/api/notify` returns 401 only for authentication problems, 404 for an unknown domain, 400 for misconfigured SMTP hosts and 500 for delivery errors.

### Loading states

The domains index shows a full-page loader on first load. Keyword, idea and insight tables show their own spinner, so the surrounding workspace stays visible while data refreshes.

---

## External API

Send the header `Authorization: Bearer <APIKEY>` (the `APIKEY` environment value). The same key is the only credential the [MCP server](#mcp-server) accepts. All other routes need a logged-in session. Every `domain` field is a real domain name such as `example.com`, not a URL slug.

After 5 wrong keys from one client address, further requests carrying an `Authorization` header get `429` with `Retry-After: 900` for 15 minutes, even with the right key. The count is in memory (reset on restart) and uses the address selected by `TRUST_PROXY`.

| Method | Endpoint | Fields | What it does |
| --- | --- | --- | --- |
| GET | `/api/keyword` | Query `id` (required) | Stored data and position history of one keyword. |
| GET | `/api/keywords` | Query `domain` (required) | All tracked keywords of a domain. |
| GET | `/api/domains` | Query `withstats` (optional; `true` adds keyword statistics) | All tracked domains. |
| POST | `/api/refresh` | Body `ids` (array of keyword IDs), or query `id` (comma-separated IDs, or `all` with query `domain`) | Starts a position refresh for the chosen keywords. |
| POST | `/api/cron` | None | Starts a background refresh for every domain with scraping enabled, the same job the scheduled cron runs. 400 if no scraper is set up. |
| POST | `/api/notify` | Query `domain` (optional) | Sends the notification email for one domain, or all domains when omitted. |
| GET | `/api/searchconsole` | Query `domain` (required) | Search Console data of a domain (refetched if older than 24 hours). |
| POST | `/api/searchconsole` | None | Refreshes Search Console data for all domains. |
| GET | `/api/insight` | Query `domain` (required) | Search Console insight (top pages, keywords, countries, stats). |
| GET | `/api/ideas` | Query `domain` (optional; omit for the research page) | Saved keyword ideas and favourites. |
| POST | `/api/ideas` | Body `domain` (optional), `seedType` (`auto`, `custom`, `tracking`, `searchconsole`), `keywords` (up to 1000 strings), `country` (two letters), `language` (Google Ads language ID), `seedSCKeywords`, `seedCurrentKeywords` | Fetches and saves new ideas from Google Ads. `seedType: auto` needs a `domain`. |

```bash
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3000/api/keywords?domain=example.com"
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3000/api/insight?domain=my-site.com"
```

An invalid domain returns 400, and an unknown one returns 404 where the endpoint looks the domain up.

### Responses

Successful (2xx) responses return the data directly and include an `X-Request-Id` header.

```json
// GET /api/domains - 200 OK
{
  "domains": [ /* DomainType[] */ ]
}
```

Errors (4xx/5xx) use one envelope:

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
| --- | --- | --- |
| `error.code` | `string` | `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `CONFLICT`, `METHOD_NOT_ALLOWED`, `INTERNAL_SERVER_ERROR` and similar |
| `error.message` | `string` | Human-readable description |
| `error.details` | `unknown` (optional) | Extra context, such as validation errors |
| `requestId` | `string` (optional) | Matches the `X-Request-Id` header |

## MCP server

SerpBear serves a read-only [Model Context Protocol](https://modelcontextprotocol.io) server at `/api/mcp` (Streamable HTTP, stateless). Any MCP client that accepts a remote URL and a header can connect.

- **URL:** `https://<your-host>/api/mcp`. Use HTTPS (for example behind a reverse proxy), because the key is sent on every request.
- **Header:** `Authorization: Bearer <APIKEY>`. This is the only accepted credential: cookies and login sessions do not work here, and a wrong key counts towards the same lockout as the REST API.
- **Methods:** `POST` only; others return 405.

| Tool | Returns |
| --- | --- |
| `get_keyword` | One keyword by `id`, with position history |
| `list_keywords` | All keywords of a `domain` |
| `list_domains` | All domains, optionally with `withstats` |
| `get_searchconsole` | Raw Search Console rows for a `domain` (3, 7 and 30 days) |
| `get_insight` | Top pages, keywords and countries for a `domain` |
| `get_keyword_ideas` | Saved ideas and favourites for a `domain`, or the research list when omitted |

Tools that start scrapes, send email or spend Google Ads quota are not exposed; use the [External API](#external-api) for those.

---

## Development workflow

- **Node.js:** run `nvm use` to adopt the version in `.nvmrc`, then `npm install`.
- **Lint:** `npm run lint` runs ESLint. `npm run lint:css` runs Stylelint on `styles/*.css`; use `npx stylelint "**/*.{css,scss}"` for component styles. ESLint warns above 200 characters per line and function complexity above 60; prefix unused arguments or errors with `_`. Object and array literals must not have trailing commas.
- **Tests:** `npm test` runs Jest with the `@happy-dom/jest-environment` adapter, `npm run test:ci` mirrors CI, and `npm run test:cv -- --runInBand` produces serialised coverage. Keep the camelCase `mapPackTop3` flag in fixtures.
- **Database:** `npm run db:migrate` and `npm run db:revert`.
- **Build and run:** `npm run build`, then `npm run start`. `npm run start:all` runs the web server and cron worker together.
- **UI patterns:** add icons through the `ICON_RENDERERS` map in `components/common/Icon.tsx`, and reuse the exported keyword filtering helpers for table views. `SelectField` respects its `minWidth` prop (default 180). Google Ads and Search Console settings show the latest `settingsError` above the form.

## Contributing

1. Fork and clone the repository.
2. Make focused commits with descriptive messages.
3. Add or update tests for any behavioural change.
4. Run `npm run lint` and `npm test` before opening a pull request, and update `CHANGELOG.md`.

See [`AGENTS.md`](./AGENTS.md) for repository-wide guidelines.

## License

SerpBear is distributed under the [MIT License](./LICENSE). Commercial support and custom integrations are available; open a discussion if you need help deploying at scale.
