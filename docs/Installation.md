# Installation

## Setup

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
# edit the values in docker-compose.yml: replace every change-me placeholder
docker compose up -d
```

In `docker-compose.yml`, under `environment:`, set at least:

- `USER_NAME` and `PASSWORD`: the dashboard login.
- `SECRET` and `APIKEY`: two different long random values (`openssl rand -hex 32`).
- `NEXT_PUBLIC_APP_URL`: the public URL of your deployment.

The app is served at <http://localhost:3030> (compose maps host port 3030 to container port 3000). Sign in, add a domain, then open **Settings → Scraper** to choose a provider and enter its API key. See [Scrapers](Scrapers) for the providers.

All other variables are described in [Configuration](Configuration).

## Optional integrations

SerpBear works without any of these. Add them when you want the extra data.

- **Google Search Console:** shows real impressions, clicks and CTR next to your rankings. Setup steps are in [Google Integrations](Google-Integrations#google-search-console).
- **Google Ads:** keyword research and monthly search volumes. Setup steps are in [Google Integrations](Google-Integrations#google-ads).
- **Serper.dev (free):** turns Google redirect links into real page URLs. See below.

### Serper.dev free API key for real result links

Some SERP providers return result links that are Google redirects, such as `https://www.google.com/goto?url=CAES...`, instead of the page's real address. SerpBear can't match your domain against a redirect link, so a keyword can look unranked or show the wrong URL.

[Serper.dev](https://serper.dev) has a `/resolve` endpoint that turns these redirect links into the real URLs, and **using it is free**. You only need to sign up for a free account to get an API key. No payment is required, and you don't need to use Serper as your scraper.

1. Sign up at [serper.dev](https://serper.dev) and copy your API key from the dashboard.
2. Set it in `docker-compose.yml`:

   ```yaml
   SERPER_API_KEY: your-serper-api-key
   ```

3. Run `docker compose up -d` to recreate the container.

**How it works:**
- After a provider returns a page of results, SerpBear collects the links that are `google.com/goto` (or `/url`) redirects. Links that are already real URLs are left alone and never sent.
- All the redirect links from that page go to Serper's `/resolve` endpoint in one request. Serper follows each one and returns the real address, and SerpBear swaps it in before the position is saved.
- It works for every provider, not only Serper.
- A call can take up to about 30 seconds, so each request has a 30 second timeout. A call that fails or times out is tried once more. Links that come back unresolved are sent once more, after the number of seconds Serper asks for (`retryAfter`).
- Anything still unresolved keeps the Google link and a warning is logged. Without a key, redirect links stay as they are.

## Update

Back up the data first:

```bash
docker compose stop
docker cp serpbear:/app/data ./serpbear-data-backup
docker compose start
```

With Docker, run `docker compose pull && docker compose up -d`. Migrations apply on start, and the database is backed up before any migration that changes data.

With Node.js, pull, run `npm install`, `npm run db:migrate`, then rebuild.

Read the upgrade notes for your version before upgrading, and the [changelog](https://github.com/djav1985/v-serpbear/blob/main/CHANGELOG.md).

## Where the data lives

Docker Compose stores data in a named volume (`data`) mounted at `/app/data`, prefixed with the project name (for example `v-serpbear_data`; find it with `docker volume ls`). It holds the SQLite database, `settings.json`, Search Console exports (`SC_<domain>.json`), keyword ideas (`IDEAS_*.json`), `session.json`, `email-throttle.json`, `failed_queue.json` and any white-label logo.

Settings are stored in `data/settings.json`, with secrets encrypted using `SECRET`.
