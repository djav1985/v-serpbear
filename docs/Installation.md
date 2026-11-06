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
