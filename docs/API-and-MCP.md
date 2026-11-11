# API and MCP

The REST API uses `APIKEY`; MCP has its own `MCP_APIKEY`. Domains are always real domain names such as `example.com`.

## MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for AI assistants. It supports direct bearer access and includes OAuth authorization handlers. OAuth clients that require standard automatic discovery cannot connect to this checkout because the well-known discovery routes are missing.

Set `MCP_ENABLED=false` to disable the MCP endpoint and OAuth protocol handlers. By default, MCP is enabled; OAuth itself remains opt-in through `MCP_OAUTH=true`.

- **URL:** `https://<your-host>/api/mcp` (Streamable HTTP, `POST` only). Use HTTPS, because the key is sent on every request.
- **Direct key:** set `MCP_APIKEY`, then send `Authorization: Bearer <MCP_APIKEY>`. Cookies and login sessions are not accepted.
- **OAuth:** set `MCP_OAUTH=true`. `/api/oauth/authorize` handles authorization requests and `/api/oauth/approve` displays the themed approval screen. Approve using the configured `USER_NAME` (or `USER`) and `PASSWORD`, or an existing valid login cookie. Entered credentials authorize only this request and do not create a login cookie. The screen offers read-only access. Incorrect credentials are limited to 10 attempts per IP per 15 minutes. OAuth protocol endpoints support PKCE, refresh-token rotation and revocation; client and token state is stored in `data/mcp_oauth.json`.
- **Discovery limitation:** this checkout does not contain handlers for `/.well-known/oauth-authorization-server` or `/.well-known/oauth-protected-resource` (nor the MCP-path-specific protected-resource metadata URL). OAuth clients that depend on standard discovery will therefore fail automatic setup until those routes are implemented. The OAuth protocol handlers themselves are under `/api/oauth`.
- **Token lifetimes:** authorization codes expire after 5 minutes, access tokens after 24 hours, and refresh tokens after 90 days. Refresh tokens rotate when exchanged; reuse of a rotated token revokes that grant.
- **OAuth endpoints:** `POST /api/oauth/register`, `GET` and form `POST /api/oauth/authorize`, `POST /api/oauth/token`, and `POST /api/oauth/revoke`. The approval page is `/api/oauth/approve`.
- **Persistence:** keep `/app/data` on persistent storage. OAuth clients and hashed tokens are stored in `data/mcp_oauth.json`; no database schema changes are needed.

`MCP_APIKEY` is optional and only used for direct MCP bearer access. It is separate from `APIKEY`, which remains the REST API credential used server-side when MCP calls SerpBear's existing REST routes.

| Tool | Returns |
| --- | --- |
| `get_keyword` | One keyword by `id`, with position history |
| `list_keywords` | All keywords of a `domain` |
| `list_domains` | All domains, optionally with `withstats` |
| `get_searchconsole` | Raw Search Console rows for a `domain` (3, 7 and 30 days) |
| `get_insight` | Top pages, keywords and countries for a `domain` |
| `get_keyword_ideas` | Saved ideas and favourites for a `domain`, or the research list when omitted |

Tools that start scrapes, send email or spend Google Ads quota are not exposed; use the REST API for those.

## External API

A REST API for scripts and automation. Send `Authorization: Bearer <APIKEY>`. After 5 wrong keys from one address within 15 minutes, that address gets `429` for 15 minutes. Routes not listed below need a logged-in session.
Protected pages and API routes validate the login session directly; there is no separate session-check endpoint.

```bash
export APIKEY=your-api-key
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3030/api/serp/keywords?domain=example.com"
```

The example uses port 3030, which Docker Compose maps to the app.

| Method | Endpoint | What it does |
| --- | --- | --- |
| GET | `/api/serp/keyword?id=` | One keyword with its position history |
| GET | `/api/serp/keywords?domain=` | All tracked keywords of a domain |
| GET | `/api/serp/domains` | All tracked domains (`withstats=true` adds keyword statistics) |
| POST | `/api/serp/refresh` | JSON body `{ ids }` refreshes selected keywords; `{ scope: "domain", domain }` refreshes one domain; `{ scope: "enabled-domains" }` runs the scheduled refresh; `{ keyword, country, device }` runs a one-off keyword search (login session only, not an API key). Requests from a login session must come from this site |
| GET | `/api/serp/refresh?status=retry&id=…` | Read which keywords are still updating (read-only) |
| PUT | `/api/serp/keywords` | Update keywords: JSON body `ids` plus `sticky` (boolean), `tags` (ID-to-tag-list object), or `location` (string; include `country` if the location does not name one) |
| DELETE | `/api/serp/keywords` | Delete keywords: JSON body `ids` array |
| PUT | `/api/serp/domains` | Update a domain: JSON body `domain` plus any of `notification_emails`, `search_console`, `scrapeEnabled`, `scraper_settings`, `business_name`, `scrape_strategy`, or `scrape_pagination_limit` |
| DELETE | `/api/serp/domains` | Delete a domain: JSON body `domain` |
| PUT | `/api/app/settings` | Save app settings: JSON body `settings` object (login session required) |
| PUT | `/api/google/ideas` | Toggle an idea favorite: JSON body `keywordID`, optional `domain` |
| PUT | `/api/serp/clearfailed` | Clear the failed retry queue; no arguments |
| POST | `/api/app/email` | JSON body `{ type: "digest", domain? }` sends the digest for one domain or all; `{ type: "ideas", domain, keywords }` emails selected keyword ideas |
| GET | `/api/google/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/google/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/google/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/google/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/google/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |
