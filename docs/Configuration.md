# Configuration

Behaviour is controlled by environment variables in `docker-compose.yml` (under `environment:`) and by app settings stored in `data/settings.json`.

## Environment variables

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `USER_NAME` | `admin` | Yes | Dashboard username. `USER` is also accepted; `USER_NAME` wins when both are set. |
| `PASSWORD` | — | Yes | Dashboard password. Replace the `change-me` placeholder. |
| `SECRET` | — | Yes | Signs the session JWT stored in the `token` cookie and encrypts stored keys. Login returns 500 when it is unset. Changing it signs everyone out and makes stored encrypted keys unreadable, so they must be re-entered. Use a unique value per deployment (`openssl rand -hex 32`). |
| `APIKEY` | — | Yes | Key for REST and MCP clients, and for the cron worker's scheduled calls. When unset, scheduled jobs are skipped with a warning and MCP returns 500. Use `openssl rand -hex 32`. |
| `SESSION_DURATION` | `24` | No | Session lifetime in hours. Empty, zero, negative or non-numeric values use 24. |
| `TRUST_PROXY` | `0` | No | Number of reverse proxies in front of the app, not an IP address. See [Security](Security). |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | No | Public URL of the deployment, used for the Google Ads OAuth return origin, email links and logo, and as the cron worker's fallback origin. Set it for real deployments. |
| `APP_URL` | — | No | Server-side origin for the cron worker's own calls to the app. It takes precedence over `NEXT_PUBLIC_APP_URL` for those calls, which helps in Docker when the public URL is not reachable from inside the container. Google Ads uses it only when `NEXT_PUBLIC_APP_URL` is unset. Email links ignore it. |
| `SCREENSHOTS` | `true` | No | Domain thumbnails via thum.io. `false` shows favicons. |
| `NEXT_PUBLIC_WHITE_LABEL` | `false` | No | Enables white-label branding (name and logo). |
| `WHITE_LABEL_LOGO_FILE` | `branding-logo.png` | No | File name only, stored in `/app/data`. Accepted extensions are `png`, `jpg`, `jpeg`, `gif`, `svg` and `webp`. Used only when `NEXT_PUBLIC_WHITE_LABEL=true`, and served without login at `/api/branding/logo.<extension>`, for example `/api/branding/logo.png` (404 if the file is missing, and at any other address). Recommended size is 96×96 px. |
| (tab icon) | | No | With `NEXT_PUBLIC_WHITE_LABEL=true`, a file named `favicon.ico` in `/app/data` is used as the browser tab icon. Without that file the default icon is used. Not read when white label is off. |
| `NEXT_PUBLIC_PLATFORM_NAME` | `SerpBear` | No | App and email name. Used only in white-label mode. |
| `SEARCH_CONSOLE_CLIENT_EMAIL` | — | No | Service account email with access to your Search Console properties. |
| `SEARCH_CONSOLE_PRIVATE_KEY` | — | No | Matching private key; keep newlines escaped. |
| `REFRESH_QUEUE_CONCURRENCY` | `3` | No | Refresh tasks running at once. A domain is never refreshed twice at once. |
| `PARALLEL_REFRESH_CONCURRENCY` | `10` | No | Keywords scraped at once on the parallel path, which runs only when every keyword in the run uses SerpApi or SearchApi. Positive integer. |
| `PARALLEL_SCRAPE_CONCURRENCY` | `3` | No | Keywords scraped at once per domain on the sequential path, which is used for every other provider. Positive integer. |
| `SERPER_API_KEY` | empty | No | Free [Serper](https://serper.dev) key. When set, organic `google.com/goto` links are resolved to real URLs through Serper's `/resolve` endpoint, for every provider. Each SERP page makes one batched request with a 30 s timeout. A failed or timed-out call is tried once more, and links still unresolved are sent once more after the `retryAfter` seconds Serper reports. Anything still unresolved keeps the Google link and is logged as a warning. Without a key, those links stay as they are. |
| `LOG_LEVEL` | `info` | No | `error`, `warn`, `info` or `debug`. `off`, `none`, `false` or `0` disables logging. Logs are JSON on stdout, so use `docker logs -f <container>`. |
| `TZ` | `America/New_York` | No | IANA timezone (the standard container variable) for scheduled jobs, for "today" in results and emails, and for history date keys. An unknown name falls back to the default. Changing it later does not re-key existing history. |
| `CRON_MAIN_SCHEDULE` | `00:00` | No | Time of day (`HH:MM`, 24 hour) of every scheduled scrape and of the Search Console refresh. `scrape_interval` picks the days. |
| `CRON_FAILED_SCHEDULE` | `hourly` | No | How often failed scrapes are retried: `hourly`, `daily` (at the `CRON_MAIN_SCHEDULE` time) or `never`. |
| `CRON_EMAIL_SCHEDULE` | `06:00` | No | Time of day (`HH:MM`, 24 hour) of every email digest. `notification_interval` picks the days. |

Quote time values in YAML (`"00:00"`), or YAML may read them as numbers. See [Scheduling and Retries](Scheduling-and-Retries).

## App settings (`data/settings.json`)

Manage these in the Settings UI or at `/api/settings`.

| Key | Values and default |
| --- | --- |
| `scraper_type` | Global provider: `none` (default) or a provider ID from [Scrapers](Scrapers). |
| `scraping_api` | Global provider API key (encrypted). |
| `scrape_interval` | `daily` when blank, `other_day`, `weekly`, `monthly` or `never`. |
| `scrape_strategy` | `basic` (default) or `custom`. See [Scrapers](Scrapers#scrape-strategy). |
| `scrape_pagination_limit` | Pages fetched per keyword with `custom`, from 1 to 10. Default 5. |
| `scrape_retry` | `false` (default). Auto Retry for failed scrapes. Its retry controls appear only when it is on. |
| `scrape_delay` | Milliseconds between requests to one domain. The server caps it at 30,000 (30 s). |
| `notification_interval` | `never` (default), `daily`, `weekly` or `monthly`. |
| `notification_email_from`, `notification_email_from_name` | Sender address (default `no-reply@serpbear.com`) and display name (default the platform name). |
| `smtp_server`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_tls_servername` | SMTP connection. The port is required. |
| `search_console_client_email`, `search_console_private_key` | Search Console service account, used when the domain has none of its own. |
| `adwords_*` | Google Ads credentials for keyword ideas. |
| `keywordsColumns` | Columns shown in the keyword table. |

`GET /api/settings` is public and returns only `scraper_type`, `available_scapers`, `search_console_integrated`, `version` and `timezone` without a session. `PUT /api/settings` needs a login session (an API key is not accepted). It merges the payload: keys left out keep their stored values, and a secret sent empty is cleared.

## White labelling

Set `NEXT_PUBLIC_WHITE_LABEL=true` for a custom name and logo. Logo file changes apply on the next request, so refresh the browser. Environment value changes need a restart (`docker compose up -d`). Neither needs a rebuild.

## YAML notes for docker-compose.yml

The `environment:` block can be written as a map (`KEY: value`) or as a list (`- KEY=value`). Both are the same to Docker Compose. Use `:` with a space in the map style and `=` in the list style, and never mix them.
