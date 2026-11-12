# Troubleshooting

Start with the container log. Logs are JSON on stdout:

```bash
docker logs -f serpbear
```

Set `LOG_LEVEL` to `debug` for more detail.

## "Server configuration error" when logging in

A required variable is missing inside the container. The log says which one:

- `Login configuration error: USER/USER_NAME not set`
- `Login configuration error: PASSWORD not set`
- `Login configuration error: SECRET not set`

Set `USER_NAME`, `PASSWORD` and `SECRET` in the `environment:` section of `docker-compose.yml`, then run `docker compose up -d` to recreate the container.

## Scheduled scrapes do not run

- Check that `APIKEY` is set. When it is unset, scheduled jobs are skipped with a warning.
- Check that a scraper is chosen in **Settings → Scraper**, and that `scrape_interval` is not `never`.
- `CRON_*` and `CRON_TIMEZONE` are read at startup. Restart the container after changing them.
- An old cron expression in `CRON_MAIN_SCHEDULE` or `CRON_EMAIL_SCHEDULE` is ignored with a warning. They must be `HH:MM`.

## MCP reports a server configuration error

- OAuth approval uses `USER_NAME` (or `USER`) and `PASSWORD`, or an existing valid login cookie. `MCP_APIKEY` is optional and only used for direct MCP bearer access.
- Keep `APIKEY` set as well; MCP uses it internally to call SerpBear's existing REST routes.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin used to build OAuth issuer, discovery and redirect URLs, then restart the app.
- Check that `MCP_OAUTH=true` and `MCP_ENABLED=true`; discovery is disabled when either is false. OAuth clients may use CIMD or the existing dynamic registration flow.

## Run times are off by a few hours

Check `CRON_TIMEZONE`. It sets both the schedule and the container clock. Without it the container runs in UTC.

## Keywords show no position or an error

- Open the keyword details panel: the error message from the provider is shown there.
- A failed scrape keeps the previous position and history. Use the retry controls in Settings, and see [Scheduling and Retries](Scheduling-and-Retries).
- Check that the API key is valid for the provider selected, and that the domain does not use a different scraper override.

## Result links look like `google.com/goto/...`

Set `SERPER_API_KEY` to a free Serper key. See [Scrapers](Scrapers).

## Search Console or Google Ads errors

See [Google Integrations](Google-Integrations) for the common errors ("Forbidden", `redirect_uri_mismatch`, `DEVELOPER_TOKEN_NOT_APPROVED`).

## Email digests are not sent

Check the SMTP settings and that the domain has a notification address. See [Email Digests](Email-Digests).
