# API and MCP

Both use the same credential: the `APIKEY` environment variable, sent as `Authorization: Bearer <APIKEY>`. Domains are always real domain names such as `example.com`.

## MCP server

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server for AI assistants. Any MCP client that accepts a remote URL and a header can connect.

- **URL:** `https://<your-host>/api/mcp` (Streamable HTTP, `POST` only). Use HTTPS, because the key is sent on every request.
- **Key:** header `Authorization: Bearer <APIKEY>`. Cookies and login sessions are not accepted.

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
curl -H "Authorization: Bearer $APIKEY" "http://localhost:3030/api/keywords?domain=example.com"
```

The example uses port 3030, which Docker Compose maps to the app.

| Method | Endpoint | What it does |
| --- | --- | --- |
| GET | `/api/keyword?id=` | One keyword with its position history |
| GET | `/api/keywords?domain=` | All tracked keywords of a domain |
| GET | `/api/domains` | All tracked domains (`withstats=true` adds keyword statistics) |
| POST | `/api/refresh` | Refresh chosen keywords with body `{ "ids": [1, 2] }`, or query `id` (comma-separated, or `all` with `domain`). To poll retry status, send `{ "status": "retry", "ids": [1, 2] }` in the JSON body. The legacy `GET /api/refresh?status=retry&id=1,2` remains supported. |
| POST | `/api/cron` | Run the scheduled refresh for every domain with scraping enabled |
| POST | `/api/notify` | Send the email digest for one domain (`domain=`) or all |
| POST | `/api/volume` | Update keyword search volumes from Google Ads: body `{ "domain": "all" }` for every domain, or one domain name |
| GET | `/api/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |
