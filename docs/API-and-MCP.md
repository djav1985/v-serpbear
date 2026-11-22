# API and MCP

The REST API uses `APIKEY`; MCP has its own `MCP_APIKEY`. Domains are always real domain names such as `example.com`.

## MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server for AI assistants. Direct `MCP_APIKEY` access and OAuth `mcp:read` are read-only; OAuth `mcp:full` also enables keyword edits and ranking refreshes.

Set `MCP_ENABLED=false` to disable the MCP endpoint and OAuth protocol handlers. By default, MCP is enabled; OAuth itself remains opt-in through `MCP_OAUTH=true`.

- **URL:** `https://<your-host>/api/mcp` (Streamable HTTP, `POST` only). Use HTTPS, because the key is sent on every request.
- **Direct key:** set `MCP_APIKEY`, then send `Authorization: Bearer <MCP_APIKEY>`. This key grants read-only MCP tools. Cookies and login sessions are not accepted.
- **OAuth:** set `MCP_OAUTH=true`. `/api/oauth/authorize` handles authorization requests and `/api/oauth/approve` displays the themed approval screen. Approve using the configured `USER_NAME` (or `USER`) and `PASSWORD`, or an existing valid login cookie. Cookie-based approval accepts only same-origin form submissions. Entered credentials authorize only this request and do not create a login cookie. The screen offers read-only access. Incorrect credentials are limited to 10 attempts per detected IP per 15 minutes; when the IP is unknown, failed attempts share a fallback bucket, but correct credentials remain accepted after the limit is reached. OAuth protocol endpoints support PKCE, refresh-token rotation and revocation; client and token state is stored in `data/mcp_oauth.json`.
- **Client identification:** OAuth supports both CIMD (Client ID Metadata Document) and dynamic client registration (DCR). The client chooses during connection setup: CIMD sends its HTTPS metadata-document URL as `client_id`; DCR calls `/api/oauth/register` and uses the returned ID. Both use the same approval, scopes, PKCE and token flow. The authorization server supports the public-client `none` method with PKCE.
- **Discovery:** when OAuth is enabled and `NEXT_PUBLIC_APP_URL` is configured, authorization-server metadata is served at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-authorization-server/api/mcp`. Protected-resource metadata is served at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp`. OAuth protocol handlers remain under `/api/oauth`.
- **Token lifetimes:** authorization codes expire after 5 minutes, access tokens after 24 hours, and refresh tokens after 90 days. Refresh tokens rotate when exchanged; reuse of a rotated token revokes that grant.
- **OAuth endpoints:** `POST /api/oauth/register`, `GET` and form `POST /api/oauth/authorize`, `POST /api/oauth/token`, and `POST /api/oauth/revoke`. The approval page is `/api/oauth/approve`.
- **Persistence:** keep `/app/data` on persistent storage. OAuth clients and hashed tokens are stored in `data/mcp_oauth.json`; no database schema changes are needed.

`MCP_APIKEY` is optional and only used to authenticate direct MCP bearer access; it grants read-only tools. OAuth clients receive either `mcp:read` or `mcp:full` access. `APIKEY` remains separate and is not used by MCP: the MCP server runs the app's route handlers in process with the caller's own scope, so the `APIKEY` route allowlist is never widened for MCP. A credential with no recorded scope gets no access.

| Tool | Access | What it does |
| --- | --- | --- |
| `get_keyword` | Read | One keyword by `id`, with position history |
| `list_keywords` | Read | All keywords of a `domain` |
| `list_domains` | Read | All domains, optionally with `withstats` |
| `get_searchconsole` | Read | Raw Search Console rows for a `domain` (3, 7 and 30 days) |
| `get_insight` | Read | Top pages, keywords and countries for a `domain` |
| `get_keyword_ideas` | Read | Saved ideas and favourites for a `domain`, or the research list when omitted |
| `generate_keyword_ideas` | Read | Fetch new ideas from Google Ads; this uses Google Ads quota |
| `favorite_keyword_idea` | Full | Toggle a saved idea in or out of favorites |
| `add_keywords` | Full | Add tracked keywords to a domain |
| `update_keywords` | Full | Change keyword sticky status, tags, or location |
| `delete_keywords` | Full | Delete tracked keywords |
| `refresh_keywords` | Full | Start refreshes for keyword IDs, a domain, or all enabled domains |

`MCP_APIKEY` and OAuth `mcp:read` clients receive only the read tools. OAuth `mcp:full` clients receive the full tools as well. One-off keyword searches and email sending are not available as MCP tools.

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
| POST | `/api/serp/refresh` | JSON body `{ ids }` refreshes selected keywords; `{ scope: "domain", domain }` refreshes one domain; `{ scope: "enabled-domains" }` runs the scheduled refresh; `{ keyword, country, device }` runs a one-off keyword search (login session only, not an API key) |
| POST | `/api/app/email` | JSON body `{ type: "digest", domain? }` sends the digest for one domain or all (`{ type: "ideas", domain, keywords }` needs a login session) |
| GET | `/api/google/searchconsole?domain=` | Search Console data of a domain |
| POST | `/api/google/searchconsole` | Refresh Search Console data for all domains |
| GET | `/api/google/insight?domain=` | Search Console insight: top pages, keywords, countries and stats |
| GET | `/api/google/ideas` | Saved keyword ideas and favourites (`domain=` optional) |
| POST | `/api/google/ideas` | Fetch new ideas from Google Ads: body `seedType` (`auto`, `custom`, `tracking` or `searchconsole`), `domain`, `keywords`, `country`, `language` |

Every other route needs a login session; an API key is refused with `401`. That includes updating or deleting keywords and domains (`PUT`/`DELETE /api/serp/keywords` and `/api/serp/domains`), `PUT /api/app/settings`, `PUT /api/google/ideas`, `PUT /api/serp/clearfailed` and `GET /api/serp/refresh?status=retry`.

A request that changes data (`POST`, `PUT`, `DELETE`) and carries no `Authorization: Bearer` header is refused with `403` when a browser reports that it came from another site. Scripts that send a Bearer key, `curl` and the cron worker are not affected.
