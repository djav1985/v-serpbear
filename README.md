# SerpBear

![Animated dashboard tour](https://serpbear.b-cdn.net/serpbear_readme_v2.gif "Animated dashboard tour")

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/7e7a0030c3f84c6fb56a3ce6273fbc1d)](https://app.codacy.com/gh/djav1985/v-serpbear/dashboard) ![License](https://img.shields.io/github/license/djav1985/v-serpbear) ![Version](https://img.shields.io/github/package-json/v/djav1985/v-serpbear) ![Docker pulls](https://img.shields.io/docker/pulls/vontainment/v-serpbear)

SerpBear is a full-stack Next.js application that tracks where your pages rank on Google, adds Google Search Console and Google Ads data to those rankings, and sends scheduled email digests. It ships as a Docker image or a plain Node.js app, and offers a REST API and a read-only MCP server so scripts and AI assistants can read your rankings.

> **Warning:** Not every scraper provider is validated on every release. Report problems with a specific provider in [GitHub Discussions](https://github.com/djav1985/v-serpbear/discussions).

<br><br>

---

## Contents

- [What's new in 5.0.0](#whats-new-in-500)
- [Features](#features)
- [Getting started](#getting-started)
- [Supported SERP data providers](#supported-serp-data-providers)
- [Settings configured in `docker-compose.yml ENVs`](#settings-configured-in-docker-composeyml-envs)
- [Settings configured in `data/settings.json`](#settings-configured-in-datasettingsjson)
- [Feature deep dive](#feature-deep-dive)
- [API and MCP server](#api-and-mcp-server)
- [Project structure](#project-structure)
- [Credits](#credits)
- [License](#license)

<br><br>

---

## What's new in 5.0.0

- **Real links for Google redirects.** Results that come back as `google.com/goto` links are resolved to the real page URL, so your domain is matched correctly. It uses Serper's free `/resolve` endpoint: add a free [Serper](https://serper.dev) key as `SERPER_API_KEY` and it works for every scraper that returns those links. See [the settings table](#settings-configured-in-docker-composeyml-envs).
- **A clearer average position.** One whole number, the same on the dashboard card and in the email. Keywords that failed their last scrape are left out, a keyword that ranked before and fell out of the results counts at 10 × pages scraped, and map pack keywords count at their best spot. See [How the average position is calculated](#how-the-average-position-is-calculated).
- **Smarter keyword adding.** Discover and Ideas share one add-to-tracker bar with a Desktop/Mobile toggle, tags and a location picker. Keywords that are already tracked are skipped, and the Tracking tab can change the location of many keywords at once.

The full list of changes is in the [changelog](./CHANGELOG.md). See [Update SerpBear](#update-serpbear) before you upgrade.

<br><br>

---

## Features

**What this fork adds over [upstream SerpBear](https://github.com/towfiqi/serpbear)**

- **Map pack tracking.** Flags keywords where your business is in Google's local top three. See [Business name and map pack detection](#business-name-and-map-pack-detection).
- **Per-domain scrapers.** Give each domain its own provider and API key, or use one global scraper. See [Per-domain scrapers](#per-domain-scrapers).
- **Google redirect resolving.** `google.com/goto` result links become real URLs through Serper's free `/resolve` endpoint.
- **More providers.** PrismCrawl and DataForSEO, on top of the ones upstream supports.
- **Faster refreshes.** A parallel path for SerpApi and SearchApi, configurable concurrency limits and a per-domain refresh lock.
- **Trend arrows.** Domain stats show up and down triangles against the previous refresh.
- **Easier keyword adding.** One add-to-tracker bar for Discover and Ideas with a Desktop/Mobile toggle, tags and a location picker, plus a bulk Change Location action.
- **Larger Search Console data.** Results are read in pages of up to 25,000 rows.
- **Idea emails and digest throttling.** Email selected keyword ideas, with limits that keep digests and idea emails from flooding inboxes.
- **Set the time of day.** Scrapes, retries and digests run at times you choose, in your own timezone.
- **MCP server.** Read-only access to rankings, Search Console and ideas for AI assistants.
- **White labelling.** Custom name and logo, applied without a rebuild.
- **Security.** API-key and login lockouts, `TRUST_PROXY` support, encrypted stored keys and secrets redacted from logs.
- **Database safety.** Migrations back up your database first, and a unique index on keywords merges duplicates.

<br><br>

**Feature roadmap**

- [ ] **Multi-user support with domain-specific users.** More than one login, and you choose which domains each user can see.

<br><br>

**Core capabilities**

| Capability | Details |
| --- | --- |
| **Unlimited domains and keywords** | Track as many keywords as you like across multiple sites, per country, city and device. |
| **Managed SERP providers** | Eleven providers with built-in retries (see [Supported SERP data providers](#supported-serp-data-providers)). |
| **Failed scrape controls** | Retry all failed scrapes immediately, or clear the retry queue from Settings. |
| **Keyword research** | Search volumes and suggestions from a Google Ads account. |
| **Search Console enrichment** | Impressions, clicks and CTR next to your rankings. |
| **Email digests** | Branded summaries of winners, losers and visits, opening with a tracker summary (tracked keywords, average position, map pack count). |
| **Progressive web app** | Install the dashboard on iOS or Android. |
| **REST API** | Manage and read data programmatically (see [API and MCP server](#api-and-mcp-server)). |

<br><br>

**Architecture**

| Layer | Responsibility |
| --- | --- |
| **Frontend and API** | Next.js 16 serving React pages, JSON endpoints and the MCP server from one codebase. |
| **Database** | SQLite through a custom `better-sqlite3` dialect (`database/sqlite-dialect.js`), with Sequelize and Umzug for models and migrations. No other engine is supported. |
| **Background workers** | A Node cron runner schedules scrapes, retries, Search Console refreshes and digests from the times of day and timezone you set. |
| **Settings** | Scraper, SMTP and Google Ads credentials live in the Settings UI and are stored in `data/settings.json` (secrets encrypted with `SECRET`). |

<br><br>

---

## Getting started

### Setup SerpBear

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
# edit the environment: section of docker-compose.yml: replace every placeholder, and set USER_NAME, PASSWORD, SECRET, APIKEY and NEXT_PUBLIC_APP_URL
docker compose up -d
```

The image is published on [Docker Hub](https://hub.docker.com/r/vontainment/v-serpbear) as `vontainment/v-serpbear`:

- `vontainment/v-serpbear:latest` is the latest full stable release, for production.
- `vontainment/v-serpbear:beta` is the latest development release, with new features and improvements.
- A version number such as `vontainment/v-serpbear:5.0.0` pins a specific stable release.

The app is served at <http://localhost:3030> (compose maps host port 3030 to container port 3000). Sign in with `USER_NAME` and `PASSWORD`, add a domain, then open **Settings → Scraper** to choose a provider and enter its API key.

<br><br>

### Update SerpBear

```bash
docker compose stop
docker cp serpbear:/app/data ./serpbear-data-backup
docker compose start
```

Back up `data/` first. With Docker, run `docker compose pull && docker compose up -d` and migrations apply on start. With Node.js, pull, run `npm install`, `npm run db:migrate`, then rebuild. Read the *Upgrade notes* in the [changelog](./CHANGELOG.md) before upgrading.

<br><br>

### Supported SERP data providers

| Provider | Pricing snapshot* | Geo targeting | Map pack | Mobile | Authentication |
| --- | --- | --- | --- | --- | --- |
| Serply (`serply`) | Plans from $49/mo | Country | Yes | Yes | Header `X-Api-Key` |
| SerpApi (`serpapi`) | Free 250/mo, plans from $75/mo | City | Yes | Yes | Query `api_key` |
| SearchApi (`searchapi`) | Plans from $40/mo | City | Yes | Yes | Query `api_key` |
| ValueSerp (`valueserp`) | Pay-as-you-go, 10,000 for $25 | City | Yes | Yes | Query `api_key` |
| Serper (`serper`) | Credit-based, 50,000 for $50 | Country | No | No | Query `apiKey` |
| HasData (`hasdata`) | Free 1,000/mo, plans from $49/mo | City | Yes | Yes | Header `x-api-key` |
| CrazySERP (`crazyserp`) | Pay-as-you-go | City | Yes | Yes | Header `Authorization: Bearer` |
| PrismCrawl (`prismcrawl`) | 100 free credits, packages from $5 (about $0.21 per 1,000, valid 90 days) | City | Yes | Yes | Header `x-api-key` (POST JSON) |
| DataForSEO (`dataforseo`) | Pay-as-you-go, $50 minimum top-up | City | Yes | Yes | HTTP Basic, `login:password` in the API key field |
| TinyFish (`tinyfish`) | Free up to 12,000 requests/day, then pay-as-you-go | Country | No | No | Header `X-API-Key` |
| Jina AI (`jina`) | 10M free tokens with a new key (about 1,000 requests), then paid tokens | Country | No | No | Header `Authorization: Bearer` |

> \*Pricing is indicative. Check each vendor before buying. The request formats are implemented in [`scrapers/services`](./scrapers/services).
Each page request asks for 10 results. The [scrape strategy](#scrape-strategy) sets how many pages are fetched.

<br><br>

### Settings configured in `docker-compose.yml ENVs`

Behaviour is controlled by environment variables inside docker compose as well as in app settings.

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `USER` | — | Yes | Dashboard username. `.env.example` uses `admin`. |
| `USER_NAME` | — | No | Takes precedence over `USER` when set. |
| `PASSWORD` | — | Yes | Dashboard password. Replace the `change-me` placeholder. |
| `SECRET` | — | Yes | Signs the session JWT stored in the `token` cookie and encrypts stored keys. Login returns 500 when it is unset. Changing it signs everyone out and makes stored encrypted keys unreadable, so they must be re-entered. Use a unique value per deployment (`openssl rand -hex 32`). |
| `APIKEY` | — | Yes | Key for REST and MCP clients, and for the cron worker's scheduled calls. When unset, scheduled jobs are skipped with a warning and MCP returns 500. Use `openssl rand -hex 32`. |
| `SESSION_DURATION` | `24` | No | Session lifetime in hours. Empty, zero, negative or non-numeric values use 24. |
| `TRUST_PROXY` | `0` | No | Number of reverse proxies in front of the app. `true` means 1, values above 10 are capped at 10, and invalid values mean 0. Login lockouts, API-key lockouts and the keyword-search and volume rate limits then use the `X-Forwarded-For` entry that many hops from the right. Without it, behind a proxy, every client shares the proxy's address. It also controls whether `X-Forwarded-Proto`, `X-Forwarded-Protocol` and `X-Forwarded-Ssl` set the `Secure` cookie flag; without it only the socket's TLS state does. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | No | Public URL of the deployment, used for the Google Ads OAuth return origin, email links and logo, and as the cron worker's fallback origin. Set it for real deployments. |
| `APP_URL` | — | No | Server-side origin for the cron worker's own calls to the app. It takes precedence over `NEXT_PUBLIC_APP_URL` for those calls, which helps in Docker when the public URL is not reachable from inside the container. Google Ads uses it only when `NEXT_PUBLIC_APP_URL` is unset. Email links ignore it. |
| `SCREENSHOTS` | `true` | No | Domain thumbnails via thum.io. `false` shows favicons. |
| `NEXT_PUBLIC_WHITE_LABEL` | `false` | No | Enables white-label branding (name and logo). |
| `WHITE_LABEL_LOGO_FILE` | `branding-logo.png` | No | File name only, stored in `/app/data`. Accepted extensions are `png`, `jpg`, `jpeg`, `gif`, `svg` and `webp`. Used only when `NEXT_PUBLIC_WHITE_LABEL=true`, and served without login at `/api/branding/logo.<extension>`, for example `/api/branding/logo.png` (404 if the file is missing, and at any other address). Recommended size is 96×96 px. |
| (tab icon) | | No | With `NEXT_PUBLIC_WHITE_LABEL=true`, a file named `favicon.ico` in `/app/data` is used as the browser tab icon. Without that file the default icon is used. Not read when white label is off. |
| `NEXT_PUBLIC_PLATFORM_NAME` | `SerpBear` | No | App and email name. Used only in white-label mode. |
| `SEARCH_CONSOLE_CLIENT_EMAIL` | — | No | Service account email with access to your Search Console properties. |
| `SEARCH_CONSOLE_PRIVATE_KEY` | — | No | Matching private key; keep newlines escaped in `.env` files. |
| `REFRESH_QUEUE_CONCURRENCY` | `3` | No | Refresh tasks running at once. A domain is never refreshed twice at once. |
| `PARALLEL_REFRESH_CONCURRENCY` | `10` | No | Keywords scraped at once on the parallel path, which runs only when every keyword in the run uses SerpApi or SearchApi. Positive integer. |
| `PARALLEL_SCRAPE_CONCURRENCY` | `3` | No | Keywords scraped at once per domain on the sequential path, which is used for every other provider. Positive integer. |
| `SERPER_API_KEY` | empty | No | Free [Serper](https://serper.dev) key. When set, organic `google.com/goto` links are resolved to real URLs through Serper's `/resolve` endpoint, for every provider that returns them (TinyFish and Jina AI do not). Each SERP page makes one batched request with a 30 s timeout. A failed or timed-out call is tried once more, and links still unresolved are sent once more after the `retryAfter` seconds Serper reports. Anything still unresolved keeps the Google link and is logged as a warning. Without a key, those links stay as they are. |
| `LOG_LEVEL` | `info` | No | `error`, `warn`, `info` or `debug`. `off`, `none`, `false` or `0` disables logging. Logs are JSON on stdout, so use `docker logs -f <container>`. |
| `TZ` | `America/New_York` | No | IANA timezone (the standard container variable) for scheduled jobs, for "today" in results and emails, and for history date keys. An unknown name falls back to the default. Changing it later does not re-key existing history. |
| `CRON_MAIN_SCHEDULE` | `00:00` | No | Time of day (`HH:MM`, 24 hour) of every scheduled scrape and of the Search Console refresh. `scrape_interval` picks the days. |
| `CRON_FAILED_SCHEDULE` | `hourly` | No | How often failed scrapes are retried: `hourly`, `daily` (at the `CRON_MAIN_SCHEDULE` time) or `never`. |
| `CRON_EMAIL_SCHEDULE` | `06:00` | No | Time of day (`HH:MM`, 24 hour) of every email digest. `notification_interval` picks the days. |
| `CRON_VOLUME_SCHEDULE` | `03:00` | No | Time of day (`HH:MM`, 24 hour) of the weekly keyword volume refresh, which runs every Monday. |

<br><br>

### Settings configured in `data/settings.json`

Manage these in the Settings UI or at `/api/settings`.

| Key | Values and default |
| --- | --- |
| `scraper_type` | Global provider: `none` (default) or a provider ID from the [providers table](#supported-serp-data-providers). |
| `scraping_api` | Global provider API key (encrypted). |
| `scrape_interval` | `daily` when blank, `other_day`, `weekly`, `monthly` or `never`. See [Scheduling](#scheduling). |
| `scrape_strategy` | `basic` (default) or `custom`. See [Scrape strategy](#scrape-strategy). |
| `scrape_pagination_limit` | Pages fetched per keyword with `custom`, from 1 to 10. Default 5. |
| `scrape_retry` | `false` (default). Auto Retry for failed scrapes. Its retry controls appear only when it is on. |
| `scrape_delay` | Milliseconds between requests to one domain (Settings: Keyword Scrape Delay). The server caps it at 30,000 (30 s). For a scraper with its own base interval (TinyFish, 2 seconds) it is added on top of that base, and the spacing then applies across all domains. |
| `notification_interval` | `never` (default), `daily`, `weekly` or `monthly`. |
| `notification_email_from`, `notification_email_from_name` | Sender address (default `no-reply@serpbear.com`) and display name (default the platform name). |
| `smtp_server`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_tls_servername` | SMTP connection. The port is required. |
| `search_console_client_email`, `search_console_private_key` | Search Console service account, used when the domain has none of its own. |
| `adwords_*` | Google Ads credentials for keyword ideas. |
| `keywordsColumns` | Columns shown in the keyword table. |

<br><br>

---

## Feature deep dive

### Keyword tracking workflow

1. **Add a domain** with the host name to monitor.
2. **Add keywords** with the query, country, optional state and city, and device (desktop or mobile).
3. **Scrape.** The cron worker (or **Refresh**) asks your provider for results and stores positions, using the [scrape strategy](#scrape-strategy).
4. **Analyse.** Charts and tables show history, average position and day-over-day change.
5. **Share** through the API, the MCP server or email digests.

### Scrape strategy

Google's removal of `num=100` limits SERP APIs to 10 results per request. The strategy sets how many pages are fetched per keyword, trading API credits against depth.

| Strategy | Behaviour | Requests per keyword |
| --- | --- | --- |
| **Basic** (default) | Page 1 only (positions 1–10). | 1 |
| **Custom** | Pages 1 to N, where N is 1–10 (default 5). Fetching stops early once the domain is found, or when a page is empty or fails. | 1 to N |

- **Globally:** **Settings → Scraper → Scrape Strategy**. Choosing Custom shows a page-count selector.
- **Per domain:** the domain's **Scraper** tab, **Scrape Strategy Override**. Any value other than **Use Global Setting** enables the domain controls.
- **Failed pages:** if a page request fails and the domain was not found on the pages that loaded, the keyword is reported as an error with the provider's message. It keeps its previous position and history rather than being recorded as "not ranked".

### Per-domain scrapers

A domain can use its own provider without changing the global default. Open the domain, switch to the **Scraper** tab, pick a provider (or **System Scraper** to inherit the global one) and enter its API key. Stored keys are encrypted.

A refresh uses the faster parallel path only when every keyword in the run uses SerpApi or SearchApi. See `PARALLEL_REFRESH_CONCURRENCY` and `PARALLEL_SCRAPE_CONCURRENCY` in the settings table above.

**Serper.** Serper has no mobile option. In a refresh, a mobile keyword with a matching desktop keyword (same domain, keyword, country and location) in the same run is not scraped. It takes the desktop keyword's result, so no extra request is made. A mobile keyword with no matching desktop keyword is scraped with desktop results, and a warning is logged for it.

**TinyFish.** TinyFish has no mobile option, so it behaves like Serper above: mobile keywords reuse the matching desktop result or are scraped with desktop results. It targets by country only and has no map pack. Its results are real page links, so `SERPER_API_KEY` is not needed. Personal accounts are limited to 30 requests per minute, so requests are spaced at least 2 seconds apart across all keywords and domains, and the Keyword Scrape Delay is added on top of that. A rate-limited request is retried like any other failed request.

**Jina AI.** Jina AI has no mobile option, so it behaves like Serper above. It targets by country only (`gl` and `hl`) and has no map pack. Its results are real page links, so `SERPER_API_KEY` is not needed. Each request costs at least 10,000 tokens. Jina documents 100 requests per minute for a key, which the default concurrency stays under, so there is no baseline spacing; the Keyword Scrape Delay still applies. Jina does not document paging, so extra pages are requested with a `page` parameter that has not been confirmed: use the Basic scrape strategy (page 1 only) unless you have checked it.

### Scheduling

- `scrape_interval` runs at the `CRON_MAIN_SCHEDULE` time: `daily` every day, `other_day` on odd days of the month, `weekly` on Mondays, `monthly` on the 1st. `never` turns scheduled scraping off.
- `notification_interval` runs at the `CRON_EMAIL_SCHEDULE` time: `daily`, `weekly` (Mondays) or `monthly` (the 1st). `never` turns digests off.
- Keyword search volumes are refreshed every Monday at the `CRON_VOLUME_SCHEDULE` time, exactly like the **Update Keyword Volume Data** button in Settings (all keywords, one country at a time). Google updates its volume numbers about once a month, so the weekly run gives several chances to catch every keyword. It needs Google Ads connected; without it the run is skipped with a log message.
- Failed scrapes are retried at the `CRON_FAILED_SCHEDULE` rate, and only while **Auto Retry** (`scrape_retry`) is on.
- Settings changes apply without a restart: the worker watches `data/settings.json` and re-checks it every 30 minutes. `CRON_*` variables are read at startup, so they need a restart.

### Business name and map pack detection

The optional **Business Name** field in the domain's scraper tab turns on map pack detection. Matching uses the name only, never the link.

1. Each provider builds a list of local results from its response, in the order Google shows them.
2. If one of the first three titles matches your business name, the keyword counts as a map pack appearance.
3. Names match ignoring case, accents, punctuation, repeated spaces and `&` versus `and`, so `Smith & Sons, Inc.` matches `smith and sons inc`.

**Example:** for `vontainment.com`, enter "Vontainment" if that is your Google Business Profile name.

Only the first results page is checked. The keyword details panel shows **Local Search Results** with your listing in green (a match among the first three) and other businesses in yellow, and highlights your organic result in green. Results saved before this flag existed show yellow until the keyword is refreshed.

### Keyword details panel

Click a keyword row for the SERP snapshot, the rank-history chart and the local results.

- **Not found.** The badge reads `Not in First N`, where N is the number of results actually scraped, or `No Results` when nothing was scraped.
- **Map pack.** A "MAP" badge sits under the country flag in the dashboard, the details and email digests. It turns red while the keyword is out of the map pack after having been in it (for up to 30 days). The domains overview shows a Map Pack counter.

### How the average position is calculated

A domain's average position (on the dashboard card and in the digest) is a whole number, rounded from the keyword positions below. It is recalculated after every refresh that stores results and whenever keywords are added or deleted. Changing the scrape strategy, page count or business name does not change it until the next refresh.

Each keyword is counted as follows:

1. **Latest scrape failed:** left out.
2. **In the map pack top three with a known spot (1–3):** counts at the better (lower) of its spot and its organic position. An organic position of 0 is ignored, so the spot is used.
3. **Organic position above 0:** counts at that position.
4. **Position 0, ranked before** (any saved history value above 0), **and not in the map pack top three:** counts at 10 × the pages scraped. Basic is 10. Custom is 10 × the page count, taken from the domain's setting first, then the global one (default 5).
5. **Anything else** (never ranked, or a map pack keyword at 0 with no known spot): left out.

The Keywords and Map Pack counts include every keyword, whether or not it is in the average. The dashboard trend arrows compare each stat with its previous saved value.

**Example:** keywords at positions 4 and 0 (ranked before, Basic), plus a map pack keyword at spot 2 with organic position 0, give (4 + 10 + 2) / 3 = 5.33, shown as 5.

### Keyword CSV export

**Export as csv** in the domain header downloads `<domain>-keywords_serp.csv` with the columns `ID`, `Keyword`, `Map Pack`, `Position`, `URL`, `Country`, `Location`, `Device`, `Updated`, `Added` and `Tags`.

- **Map Pack:** `0` when not in the top three, `1`–`3` for its spot, and empty when it is in the top three but no spot is known.
- **Position:** `-` when the keyword is unranked.
- Text cells that start with `=`, `+`, `-` or `@` get a leading apostrophe so spreadsheet apps read them as text.

### Google Search Console

- Add a service account to show impressions, clicks and CTR next to each keyword. Credentials are read from the domain's own settings first, then the Settings page, then `SEARCH_CONSOLE_CLIENT_EMAIL` and `SEARCH_CONSOLE_PRIVATE_KEY`.
- Cached data is refetched when a dashboard or API read finds it more than 24 hours old, and by the cron at the `CRON_MAIN_SCHEDULE` time. Search Console days follow Pacific Time (`America/Los_Angeles`) whatever `TZ` is.
- If one of the 3, 7 or 30 day requests fails, only that window keeps its previous data and the error is recorded; a successful fetch with no rows is stored as an empty result instead of being treated as a failure. The 7 day comparison uses calendar dates, so missing days in the stored stats do not shift it.
- Insight totals compute CTR as clicks divided by impressions, and the average position is weighted by impressions. The Pages table counts distinct keywords.
- The Discover tab disables keywords that are already tracked, and "select all" skips them.
- It is optional. Without credentials the dashboard card is hidden and the Insight tab shows a message.

### Keyword research and Google Ads

- Connect a Google Ads account in Settings (there are no Google Ads environment variables) to get suggestions and historical volumes. Sign-in needs `NEXT_PUBLIC_APP_URL` or `APP_URL` to be set.
- The seed type decides where suggestions come from: `auto` uses the domain as a site seed, `custom` your keyword list, `tracking` the domain's tracked keywords, and `searchconsole` its top 100 Search Console queries by impressions over the last 30 days.
- An idea is disabled only when it is tracked for every selected device, so a partly tracked idea can still be added for the missing device.
- A domain-wide volume update across several countries runs in the background (you reload later to see the volumes), and updating all domains is limited to 2 times per hour per client.
- Selected ideas can be emailed from the research table or a domain's ideas tab, limited to 10 per domain per hour.

### Email digests

- Digests summarise gains and losses, top movers and, when available, Search Console traffic, opening with a tracker summary.
- SMTP (server, port, username, password, sender, display name and TLS server name) is set in the Notification settings modal, not in environment variables. The port is required. The sender defaults to `no-reply@serpbear.com`.
- Recipients are set per domain, in the domain's settings. There is no global recipient. Clearing the SMTP settings makes scheduled sends fail with `400`.
- Each domain gets at most one digest per hour and five per calendar day in `TZ`.
- **Send Notifications Now** in the Notification modal sends a digest for every domain with scraping enabled. Domains without a notification address, or held back by the throttle, are reported as skipped.

### White labelling

Set `NEXT_PUBLIC_WHITE_LABEL=true` for a custom name and logo. The logo is served at `/api/branding/logo.<extension>` (the extension of `WHITE_LABEL_LOGO_FILE`, for example `/api/branding/logo.png`), which the dashboard and email digests both use. To change the browser tab icon too, put a `favicon.ico` file in `/app/data`; without it the default icon is used, and with white label off the file is ignored. Logo file changes apply on the next request, so refresh the browser. Environment value changes need a restart (`docker compose up -d` or restarting the Node.js process). Neither needs a rebuild.

### Settings and data

Settings are stored in `data/settings.json`, with secrets encrypted using `SECRET`. `GET /api/settings` is public and returns only `scraper_type`, `available_scapers`, `search_console_integrated`, `version` and `timezone` without a session. `PUT /api/settings` needs a login session (an API key is not accepted). It merges the payload: keys left out keep their stored values, and a secret sent empty is cleared. Once logged in, `GET /api/settings` shows saved credentials (scraper API key, SMTP password, Search Console private key, Google Ads client secret, refresh token and developer token) as a row of bullets instead of the real value, and saving with the bullets still in place keeps the stored secret. `scrape_interval` must be one of the values above, and `scrape_delay` must be blank, `none` or a whole number from 0 to 30,000; anything else is rejected with a 400.

Docker Compose stores data in a named volume (`data`) mounted at `/app/data`, prefixed with the project name (for example `v-serpbear_data`; find it with `docker volume ls`). It holds the SQLite database, `settings.json`, Search Console exports (`SC_<domain>.json`), keyword ideas (`IDEAS_*.json`), `session.json`, `email-throttle.json`, `failed_queue.json` and any white-label logo.

<br><br>

---

## API and MCP server

Both use the same credential: the `APIKEY` environment variable, sent as `Authorization: Bearer <APIKEY>`. Domains are always real domain names such as `example.com`.

<br><br>

### MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for AI assistants. Any MCP client that accepts a remote URL and a header can connect.

- **URL:** `https://<your-host>/api/mcp` (Streamable HTTP, `POST` only). Use HTTPS, because the key is sent on every request.
- **Key:** header `Authorization: Bearer <APIKEY>`. Cookies and login sessions are not accepted.

| Tool | Returns |
| --- | --- |
| `get_keyword` | One keyword by `id`, with position history |
| `list_keywords` | All keywords of a `domain` |
| `list_domains` | All domains, optionally with `withstats` |
| `get_searchconsole` | Raw Search Console rows for a `domain` (3, 7 and 30 days) |
| `get_insight` | Top pages, keywords and countries for a `domain` |
| `get_keyword_ideas` | Saved ideas and favourites for a `domain`, or the research list when omitted |

Tools that start scrapes, send email or spend Google Ads quota are not exposed; use the REST API for those.

<br><br>

### External API

A REST API for scripts and automation. Send `Authorization: Bearer <APIKEY>`. After 5 wrong keys from one address within 15 minutes, that address gets `429` for 15 minutes. Routes not listed below need a logged-in session.

```bash
export APIKEY=your-api-key
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3000/api/keywords?domain=example.com"
```

The example uses port 3000 (Node.js). Docker Compose serves the app on port 3030.

| Method | Endpoint | What it does |
| --- | --- | --- |
| GET | `/api/keyword?id=` | One keyword with its position history |
| GET | `/api/keywords?domain=` | All tracked keywords of a domain |
| GET | `/api/domains` | All tracked domains (`withstats=true` adds keyword statistics) |
| POST | `/api/refresh` | Refresh chosen keywords: body `ids`, or query `id` (comma-separated, or `all` with `domain`) |
| POST | `/api/cron` | Run the scheduled refresh for every domain with scraping enabled |
| POST | `/api/notify` | Send the email digest for one domain (`domain=`) or all |
| GET | `/api/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |

<br><br>

---

## Project structure

| Path | Contents |
| --- | --- |
| `pages/` | Next.js pages (`domains`, `domain`, `research`, `login`) and the JSON and MCP routes in `pages/api/` |
| `components/` | React components grouped by area: `common`, `domains`, `ideas`, `insight`, `keywords`, `settings` |
| `services/` | Client data hooks and API calls, such as `useFetchKeywords` |
| `hooks/` | Shared React hooks, such as `useAuth` and `useBranding` |
| `utils/` | Server and shared helpers: refresh pipeline, average position, email throttle, rate limits, Search Console, timezone |
| `scrapers/` | Scraper registry, and `scrapers/services/` with one file per provider |
| `database/` | Sequelize models, `migrations/`, `init.ts` (table sync) and the SQLite dialect |
| `email/` | HTML email template |
| `styles/`, `public/` | Global CSS, and static assets such as icons, the web app manifest and flag sprites |
| `scripts/` | Repository helper scripts (`setup:git`) |
| `__tests__/` | Jest tests |
| `cron.js` | Scheduled jobs worker |
| `instrumentation.ts` | Next.js startup hook that initialises the database |
| `entrypoint.sh` | Docker entrypoint: runs migrations, then starts the web app and cron worker |
| `data/` | Runtime files (SQLite, settings, Search Console exports, retry queue). Git-ignored except `.gitkeep`. |

<br><br>

---

## Credits

SerpBear was created by Amruth Pillai. The upstream project is at <https://github.com/towfiqi/serpbear>. This fork is maintained at <https://github.com/djav1985/v-serpbear>.

## License

SerpBear is distributed under the [MIT License](./LICENSE). Commercial support and custom integrations are available; open a discussion if you need help deploying at scale.
