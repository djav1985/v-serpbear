# API and MCP

The REST API uses `APIKEY`; MCP has its own `MCP_API_KEY`. Domains are always real domain names such as `example.com`.

## MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for AI assistants. It supports direct bearer access and OAuth connections such as ChatGPT.

- **URL:** `https://<your-host>/api/mcp` (Streamable HTTP, `POST` only). Use HTTPS, because the key is sent on every request.
- **Direct key:** set `MCP_API_KEY`, then send `Authorization: Bearer <MCP_API_KEY>`. Cookies and login sessions are not accepted.
- **OAuth:** choose OAuth when connecting ChatGPT. Sign in with your normal SerpBear account and approve the connection; ChatGPT then uses OAuth access and refresh tokens. Discovery metadata is served at the standard `/.well-known/` URLs, and registration, authorization and token endpoints are under `/api/oauth`.
- **Persistence:** keep `/app/data` on persistent storage. OAuth clients and hashed tokens are stored in `data/mcp_oauth.json`; no database schema changes are needed.

`MCP_API_KEY` is optional and separate from `APIKEY`. It enables direct MCP bearer access. OAuth uses the normal SerpBear login. `APIKEY` remains the REST API credential used server-side when MCP calls SerpBear's existing REST routes.

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
| POST | `/api/serp/refresh` | Refresh chosen keywords: body `ids`, query `id` (comma-separated, or `all` with `domain`), or `scope=enabled-domains` for the scheduled refresh. Body `{ keyword, country, device }` runs a one-off keyword search (login session only, not an API key). Requests from a login session must come from this site |
| GET | `/api/serp/refresh?status=retry&id=…` | Read which keywords are still updating (read-only) |
| POST | `/api/app/email?type=digest` | Send the email digest for one domain (`domain=`) or all |
| GET | `/api/google/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/google/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/google/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/google/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/google/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |
