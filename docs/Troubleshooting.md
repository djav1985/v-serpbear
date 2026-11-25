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

## "Requests that change data must be made from this site" (403)

Login or saving fails behind a reverse proxy. SerpBear only accepts changes sent from its own address, and the proxy is hiding that address from it. The log line `403 (cross-site write)` shows the `origin` the browser sent and the `expectedOrigins` the app accepts. Set `NEXT_PUBLIC_APP_URL` to the public address (for example `https://serpbear.yourdomain.com`), or make the proxy pass the `Host` and `X-Forwarded-Proto` headers, then restart the app. See [Reverse Proxy and SSL](Reverse-Proxy-and-SSL).

## Scheduled scrapes do not run

- Check that `APIKEY` is set. When it is unset, scheduled jobs are skipped with a warning.
- Check that a scraper is chosen in **Settings → Scraper**, and that `scrape_interval` is not `never`.
- `CRON_*` and `CRON_TIMEZONE` are read at startup. Restart the container after changing them.
- An old cron expression in `CRON_MAIN_SCHEDULE` or `CRON_EMAIL_SCHEDULE` is ignored with a warning. They must be `HH:MM`.

## MCP reports a server configuration error

- OAuth approval uses `USER_NAME` (or `USER`) and `PASSWORD`, or an existing valid login cookie. `MCP_APIKEY` is optional and only used for direct MCP bearer access.
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

## Going back to a release older than 6.5

Those releases expect the Search Console client email to be encrypted. Before going back, run `npm run db:revert` with the same `SECRET` while the current release is still installed. Without it the older release reads every global secret (scraper key, SMTP password, Google Ads) as empty, and saving the settings there would erase them. If that happened before a save, restore `data/settings.json.bak-<date>`, which the upgrade made when it changed the file.

## Search Console or Google Ads errors

See [Google Integrations](Google-Integrations) for the common errors ("Forbidden", `redirect_uri_mismatch`, `DEVELOPER_TOKEN_NOT_APPROVED`).

## Email digests are not sent

Check the SMTP settings and that the domain has a notification address. See [Email Digests](Email-Digests).
