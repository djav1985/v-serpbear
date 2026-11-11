# Deploy to Fly.io

> **Read this first.**
> 1. Fly.io charges by usage. It currently waives the first $5 a month, but that is a courtesy and not a free plan.
> 2. By default a Fly machine stops when there is no traffic. A stopped machine runs no cron jobs, so no keywords are checked. To keep the scheduled scrapes working you must turn off auto-stop, which keeps the machine running all the time and uses your monthly credit faster (about $2 a month for a small machine).

## Step 1: Prerequisites

Install Git, Node.js and the Fly command line tool, [flyctl](https://fly.io/docs/flyctl/install/).

## Step 2: Clone the repository

```bash
git clone https://github.com/djav1985/v-serpbear.git
cd v-serpbear
```

## Step 3: Create the app

```bash
fly launch --name your-unique-name --region lax
```

When it asks:
- **Organization:** your personal organization.
- **Region:** the one closest to you, for example `lax` or `lhr`.
- **Postgres or Redis:** No. SerpBear uses SQLite.
- **Deploy now:** No, because the volume has to be created first.

## Step 4: Create a persistent volume

SerpBear stores its data in SQLite, so without a volume the data is wiped at every restart. Create the smallest volume, 1 GB:

```bash
fly volumes create serpbear_data --size 1 --region lax
```

## Step 5: Edit `fly.toml`

Make three changes in the generated `fly.toml`:

```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false # required, otherwise the cron jobs stop
  auto_start_machines = true
  min_machines_running = 1

[mounts]
  source = "serpbear_data"
  destination = "/app/data"
```

## Step 6: Set the secrets

Replace the app name and values. `TRUST_PROXY=1` is needed because Fly puts a proxy in front of the app.

```bash
fly secrets set \
  USER_NAME=admin \
  PASSWORD=yourpassword123 \
  NEXT_PUBLIC_APP_URL=https://your-unique-name.fly.dev \
  APIKEY=generate_a_long_random_string \
  MCP_APIKEY=generate_a_separate_long_random_string \
  SECRET=generate_another_random_string \
  SESSION_DURATION=24 \
  TRUST_PROXY=1 \
  CRON_TIMEZONE=America/New_York
```

All the variables are described in [Configuration](Configuration).

## Step 7: Deploy

```bash
fly deploy
```

## Updating

```bash
git pull origin main
fly deploy
```

## Checking the cron jobs

Because auto-stop is off, the machine stays up. Watch the live logs to see the scheduled scrapes run:

```bash
fly logs
```
