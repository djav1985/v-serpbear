# Security

## Login and API key

- The dashboard login uses `USER_NAME` and `PASSWORD`. Sessions last `SESSION_DURATION` hours (default 24) and are signed with `SECRET`.
- REST and MCP clients use `APIKEY` as a Bearer token. Cookies are not accepted for MCP.
- After repeated wrong passwords or API keys the address is locked out for 15 minutes: 5 wrong API keys from one address, and a lockout on login failures per address plus a user-wide cap. A correct password is still accepted during the user-wide cap.
- Use unique random values for `SECRET` and `APIKEY` (`openssl rand -hex 32`). Changing `SECRET` signs everyone out and makes stored encrypted keys unreadable, so they must be re-entered.

## Behind a reverse proxy: `TRUST_PROXY`

`TRUST_PROXY` is the number of reverse proxies in front of the app, not an IP address.

- `0` or unset (default): the app does not read any forwarded header, so every client counts as the same address. That keeps a client from faking its address, but it also means five wrong logins or API keys from anyone lock everyone out for 15 minutes. Set the number as soon as there is a proxy in front of the app.
- `1`: one proxy, such as nginx or Caddy. The client IP is read from the `X-Forwarded-For` header, counting one entry from the right.
- `2` and up: several proxies in a chain, such as Cloudflare plus nginx. Values above 10 are capped at 10.
- `true` means `1`, and `false` or an invalid value means `0`.

The client IP drives the login and API-key lockouts and the keyword-search and volume rate limits. It also decides whether `X-Forwarded-Proto` marks the request as HTTPS, which sets the `Secure` cookie flag. Without it every client shares one address. Set the number too high and a client can spoof its IP through the header.

## Stored secrets

Provider API keys, SMTP passwords and other secrets in `data/settings.json` are encrypted with `SECRET`. Secrets are redacted from logs. `GET /api/app/settings` is public but returns only a few non-secret fields; `PUT /api/app/settings` needs a login session.

## Data you should back up

Back up the `data/` volume before upgrades. It holds the database, `settings.json` and the Search Console exports. Migrations also back up the database file before changing data.
