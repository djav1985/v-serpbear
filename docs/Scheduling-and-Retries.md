# Scheduling and Retries

Three times of day and one retry mode control the background jobs. All times use the timezone in `TZ`.

| Setting | Where | What it does |
| --- | --- | --- |
| `CRON_MAIN_SCHEDULE` (default `00:00`) | environment | Time of day for every scheduled scrape and the Search Console refresh |
| `CRON_EMAIL_SCHEDULE` (default `06:00`) | environment | Time of day for every email digest |
| `CRON_FAILED_SCHEDULE` (default `hourly`) | environment | How often failed scrapes are retried: `hourly`, `daily` or `never` |
| `scrape_interval` | Settings | Which days scrapes run |
| `notification_interval` | Settings | Which days digests are sent |
| `scrape_retry` (Auto Retry) | Settings | Turns failed-scrape retries on |

Times are `HH:MM` in 24 hour format. A value that is not a valid time is ignored with a warning and the default is used. In YAML, quote them (`"06:00"`).

## Which days

- **`scrape_interval`** runs at the `CRON_MAIN_SCHEDULE` time: `daily` every day, `other_day` on odd days of the month, `weekly` on Mondays, `monthly` on the 1st. `never` turns scheduled scraping off. You turn scraping off in the Settings UI, not with an environment variable.
- **`notification_interval`** runs at the `CRON_EMAIL_SCHEDULE` time: `daily`, `weekly` (Mondays) or `monthly` (the 1st). `never` turns digests off.

## Failed scrapes

Failed scrapes are retried at the `CRON_FAILED_SCHEDULE` rate, and only while **Auto Retry** (`scrape_retry`) is on. `daily` retries at the `CRON_MAIN_SCHEDULE` time. `never` schedules no retry job. `CRON_FAILED_SCHEDULE` affects retries only, not the main scrapes.

A failed page request keeps the keyword's previous position and history, rather than recording "not ranked". In Settings you can retry all failed scrapes immediately, or clear the retry queue.

## When changes apply

Settings changes apply without a restart: the worker watches `data/settings.json` and re-checks it every 30 minutes. `CRON_*` and `TZ` are read at startup, so they need a restart (`docker compose up -d`).

## Timezone

`TZ` is an IANA name such as `Europe/London`. It sets when the jobs run, what "today" means in results and emails, and the calendar date used for history keys. Changing it later does not re-key existing history. If the server previously ran in UTC, the day boundary shifts once on the changeover day.
