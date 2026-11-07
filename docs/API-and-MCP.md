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
| GET | `/api/serp/keyword?id=` | One keyword with its position history |
| GET | `/api/serp/keywords?domain=` | All tracked keywords of a domain |
| GET | `/api/serp/domains` | All tracked domains (`withstats=true` adds keyword statistics) |
| POST | `/api/serp/refresh` | Refresh chosen keywords: body `ids`, or query `id` (comma-separated, or `all` with `domain`) |
| POST | `/api/app/cron` | Run the scheduled refresh for every domain with scraping enabled |
| POST | `/api/app/email?type=digest` | Send the email digest for one domain (`domain=`) or all |
| GET | `/api/google/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/google/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/google/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/google/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/google/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |
